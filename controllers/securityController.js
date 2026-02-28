import pool from "../config/db.js";
import bcrypt from "bcrypt";

const securityController = {
  // Show security registration form
  showRegister: (req, res) => {
    res.render("security/register", {
      error: null,
      success: null,
      formData: {},
    });
  },

  // Handle security registration
  register: async (req, res) => {
    try {
      const { first_name, last_name, identifier, password, confirmPassword } =
        req.body;

      console.log("Registration attempt:", {
        first_name,
        last_name,
        identifier,
      });

      // Validate input
      if (
        !first_name ||
        !last_name ||
        !identifier ||
        !password ||
        !confirmPassword
      ) {
        return res.render("security/register", {
          error: "All fields are required",
          success: null,
          formData: req.body,
        });
      }

      // Check if passwords match
      if (password !== confirmPassword) {
        return res.render("security/register", {
          error: "Passwords do not match",
          success: null,
          formData: req.body,
        });
      }

      // Validate password strength
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/;
      if (!passwordRegex.test(password)) {
        return res.render("security/register", {
          error: "Password does not meet the security requirements",
          success: null,
          formData: req.body,
        });
      }

      // Check if security user already exists
      const userExists = await pool.query(
        "SELECT * FROM users WHERE identifier = $1 AND user_type = $2",
        [identifier, "security"]
      );

      if (userExists.rows.length > 0) {
        return res.render("security/register", {
          error: "Security user with this ID already exists",
          success: null,
          formData: req.body,
        });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Insert new security user
      const newUser = await pool.query(
        `INSERT INTO users (first_name, last_name, identifier, password, user_type) 
         VALUES ($1, $2, $3, $4, 'security') RETURNING id, first_name, last_name, identifier, user_type`,
        [first_name, last_name, identifier, hashedPassword]
      );

      console.log("Security user created:", newUser.rows[0]);

      // Redirect to login with success message
      res.redirect("/security/login?register=success");
    } catch (error) {
      console.error("Security registration error:", error);

      // Check for specific database errors
      if (error.code === "23505") {
        // Unique violation
        return res.render("security/register", {
          error: "Security user with this ID already exists",
          success: null,
          formData: req.body,
        });
      }

      res.render("security/register", {
        error: "Internal server error. Please try again.",
        success: null,
        formData: req.body,
      });
    }
  },

  // Show security login form
  showLogin: (req, res) => {
    const success =
      req.query.register === "success"
        ? "Security account created successfully. Please login."
        : null;
    const error = req.query.error || null;

    res.render("security/login", {
      error: error,
      success: success,
    });
  },

  // Handle security login
  login: async (req, res) => {
    try {
      const { identifier, password } = req.body;

      // Validate input
      if (!identifier || !password) {
        return res.render("security/login", {
          error: "All fields are required",
          success: null,
        });
      }

      // Find security user
      const userResult = await pool.query(
        "SELECT * FROM users WHERE identifier = $1 AND user_type = $2",
        [identifier, "security"]
      );

      if (userResult.rows.length === 0) {
        return res.render("security/login", {
          error: "Invalid security ID or password",
          success: null,
        });
      }

      const user = userResult.rows[0];

      // Check if user is active
      if (user.status !== "active") {
        return res.render("security/login", {
          error:
            "Your account has been deactivated. Please contact administrator.",
          success: null,
        });
      }

      // Compare passwords
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.render("security/login", {
          error: "Invalid security ID or password",
          success: null,
        });
      }

      // Set session
      req.session.security = {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        identifier: user.identifier,
        userType: user.user_type,
      };

      // Redirect to security dashboard
      res.redirect("/security/dashboard");
    } catch (error) {
      console.error("Security login error:", error);
      res.render("security/login", {
        error: "Internal server error",
        success: null,
      });
    }
  },

  // Security dashboard
  dashboard: async (req, res) => {
    try {
      // For now, show a simple dashboard
      // Later we'll add event assignments and statistics
      res.render("security/dashboard", {
        security: req.session.security,
      });
    } catch (error) {
      console.error("Security dashboard error:", error);
      res.render("security/dashboard", {
        security: req.session.security,
      });
    }
  },

  // Security logout
  logout: (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Security logout error:", err);
      }
      res.redirect("/security/login");
    });
  },
  // Show QR code scanner interface
  showScanner: async (req, res) => {
    try {
      // Get assigned events for this security user (we'll implement event assignments later)
      const assignedEvents = await pool.query(`
      SELECT e.* FROM events e
      WHERE e.status = 'active'
      ORDER BY e.start_date_time DESC
    `);

      res.render("security/scan_ticket", {
        security: req.session.security,
        events: assignedEvents.rows,
        error: null,
      });
    } catch (error) {
      console.error("Scanner error:", error);
      res.render("security/scan_ticket", {
        security: req.session.security,
        events: [],
        error: "Error loading scanner",
      });
    }
  },

  // Process scanned QR code
  processScan: async (req, res) => {
    try {
      const { qr_data } = req.body;
      const securityId = req.session.security.id;

      console.log("QR Scan received:", qr_data);

      // Validate QR data
      if (!qr_data) {
        return res.json({
          success: false,
          error: "No QR code data received",
        });
      }

      let ticketData;
      try {
        ticketData = JSON.parse(qr_data);
      } catch (parseError) {
        console.error("QR data parse error:", parseError);
        return res.json({
          success: false,
          error: "Invalid QR code format",
        });
      }

      // Validate ticket data structure
      if (
        !ticketData.ticket_id ||
        !ticketData.user_id ||
        !ticketData.event_id
      ) {
        return res.json({
          success: false,
          error: "Invalid ticket data in QR code",
        });
      }

      // Get complete ticket information with user and event details
      const ticketResult = await pool.query(
        `
      SELECT 
        t.*,
        u.first_name,
        u.last_name,
        u.identifier as student_number,
        e.title as event_title,
        e.start_date_time,
        e.end_date_time,
        e.venue,
        e.status as event_status
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      JOIN events e ON t.event_id = e.id
      WHERE t.id = $1
    `,
        [ticketData.ticket_id]
      );

      if (ticketResult.rows.length === 0) {
        return res.json({
          success: false,
          error: "Ticket not found in system",
        });
      }

      const ticket = ticketResult.rows[0];

      // Check if event is active
      if (ticket.event_status !== "active") {
        return res.json({
          success: false,
          error: "Event is not active",
        });
      }

      // Check if ticket is already scanned
      if (ticket.status === "scanned") {
        return res.json({
          success: false,
          error: "Ticket already scanned",
          ticket: {
            id: ticket.id,
            status: ticket.status,
            first_name: ticket.first_name,
            last_name: ticket.last_name,
            student_number: ticket.student_number,
            event_title: ticket.event_title,
            venue: ticket.venue,
            scanned_at: ticket.updated_at,
          },
        });
      }

      // Check if ticket is sent (ready to be scanned)
      if (ticket.status !== "sent") {
        return res.json({
          success: false,
          error: "Ticket not ready for scanning",
          ticket: {
            id: ticket.id,
            status: ticket.status,
            first_name: ticket.first_name,
            last_name: ticket.last_name,
            student_number: ticket.student_number,
            event_title: ticket.event_title,
          },
        });
      }

      // Update ticket status to scanned
      const updatedTicket = await pool.query(
        `
      UPDATE tickets 
      SET status = 'scanned', 
          updated_at = NOW()
      WHERE id = $1 
      RETURNING *
    `,
        [ticketData.ticket_id]
      );

      // Log the scan activity
      await pool.query(
        `
      INSERT INTO scan_logs (ticket_id, security_user_id, scan_result, scanned_at)
      VALUES ($1, $2, $3, NOW())
    `,
        [ticketData.ticket_id, securityId, "success"]
      );

      res.json({
        success: true,
        message: "Ticket scanned successfully - Access Granted",
        ticket: {
          id: ticket.id,
          status: "scanned",
          first_name: ticket.first_name,
          last_name: ticket.last_name,
          student_number: ticket.student_number,
          event_title: ticket.event_title,
          venue: ticket.venue,
          event_time: ticket.start_date_time,
          scanned_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Scan processing error:", error);

      // Log failed scan attempt
      if (req.session.security) {
        await pool.query(
          `
        INSERT INTO scan_logs (security_user_id, scan_result, error_message, scanned_at)
        VALUES ($1, $2, $3, NOW())
      `,
          [req.session.security.id, "error", error.message]
        );
      }

      res.json({
        success: false,
        error: "Internal server error during scan processing",
      });
    }
  },

  // Show scan result page
  showScanResult: (req, res) => {
    const { success, message, ticket, error } = req.query;

    res.render("security/scan_result", {
      success: success === "true",
      message: message || "",
      ticket: ticket ? JSON.parse(ticket) : null,
      error: error || "",
      security: req.session.security,
    });
  },
};

export default securityController;
