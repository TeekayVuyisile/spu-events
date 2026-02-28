import pool from "../config/db.js";
import bcrypt from "bcrypt";

const adminController = {
  // Show admin signup form
  showSignup: (req, res) => {
    res.render("admin/sign-up", {
      error: null,
      success: null,
      formData: {},
    });
  },

  // Handle admin signup
  signup: async (req, res) => {
    try {
      const { first_name, last_name, identifier, password, confirmPassword } =
        req.body;

      // Validate input
      if (
        !first_name ||
        !last_name ||
        !identifier ||
        !password ||
        !confirmPassword
      ) {
        return res.render("admin/sign-up", {
          error: "All fields are required",
          success: null,
          formData: req.body,
        });
      }

      // Check if passwords match
      if (password !== confirmPassword) {
        return res.render("admin/sign-up", {
          error: "Passwords do not match",
          success: null,
          formData: req.body,
        });
      }

      // Validate password strength
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/;
      if (!passwordRegex.test(password)) {
        return res.render("admin/sign-up", {
          error:
            "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character",
          success: null,
          formData: req.body,
        });
      }

      // Check if admin already exists
      const adminExists = await pool.query(
        "SELECT * FROM users WHERE identifier = $1 AND user_type = $2",
        [identifier, "admin"]
      );

      if (adminExists.rows.length > 0) {
        return res.render("admin/sign-up", {
          error: "Admin with this ID already exists",
          success: null,
          formData: req.body,
        });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Insert new admin
      await pool.query(
        `INSERT INTO users (first_name, last_name, identifier, password, user_type) 
       VALUES ($1, $2, $3, $4, 'admin') RETURNING id`,
        [first_name, last_name, identifier, hashedPassword]
      );

      // Redirect to login page with success message
      res.redirect("/admin/login?signup=success");
    } catch (error) {
      console.error("Admin signup error:", error);

      // Check for specific database errors
      if (error.code === "23505") {
        // Unique violation
        return res.render("admin/sign-up", {
          error: "Admin with this ID already exists",
          success: null,
          formData: req.body,
        });
      }

      res.render("admin/sign-up", {
        error: "Internal server error. Please try again.",
        success: null,
        formData: req.body,
      });
    }
  },

  // Show admin login form
  showLogin: (req, res) => {
    const success =
      req.query.signup === "success"
        ? "Admin account created successfully. Please login."
        : null;
    const error = req.query.error || null;
    res.render("admin/login", {
      error: error,
      success: success,
    });
  },

  // Handle admin login
  login: async (req, res) => {
    try {
      const { identifier, password } = req.body;

      // Validate input
      if (!identifier || !password) {
        return res.render("admin/login", {
          error: "All fields are required",
          success: null,
        });
      }

      // Find admin user
      const adminResult = await pool.query(
        "SELECT * FROM users WHERE identifier = $1 AND user_type = $2",
        [identifier, "admin"]
      );

      if (adminResult.rows.length === 0) {
        return res.render("admin/login", {
          error: "Invalid admin ID or password",
          success: null,
        });
      }

      const admin = adminResult.rows[0];

      // Check if admin is active
      if (admin.status !== "active") {
        return res.render("admin/login", {
          error:
            "Your account has been deactivated. Please contact system administrator.",
          success: null,
        });
      }

      // Compare passwords
      const isPasswordValid = await bcrypt.compare(password, admin.password);

      if (!isPasswordValid) {
        return res.render("admin/login", {
          error: "Invalid admin ID or password",
          success: null,
        });
      }

      // Set session
      req.session.admin = {
        id: admin.id,
        firstName: admin.first_name,
        lastName: admin.last_name,
        identifier: admin.identifier,
        userType: admin.user_type,
      };

      // Redirect to admin dashboard
      res.redirect("/admin/dashboard");
    } catch (error) {
      console.error("Admin login error:", error);
      res.render("admin/login", {
        error: "Internal server error",
        success: null,
      });
    }
  },

  // Admin dashboard
dashboard: async (req, res) => {
  try {
    // Get events count
    const eventsCount = await pool.query("SELECT COUNT(*) FROM events WHERE status = 'active'");
    
    // Get users count (excluding admins)
    const usersCount = await pool.query(
      "SELECT COUNT(*) FROM users WHERE user_type != 'admin' AND status = 'active'"
    );

    // Get tickets count
    const ticketsCount = await pool.query("SELECT COUNT(*) FROM tickets");

    // Get total revenue from paid tickets
    const revenueResult = await pool.query(
      "SELECT COALESCE(SUM(price_paid), 0) as total_revenue FROM tickets"
    );

    // Get recent events
    const recentEvents = await pool.query(
      `SELECT * FROM events 
       WHERE status = 'active' 
       ORDER BY created_at DESC 
       LIMIT 5`
    );

    // Get pending reports count
    const pendingReports = await pool.query(
      "SELECT COUNT(*) FROM reports WHERE status = 'pending'"
    );

    // Get pending volunteer requests
    const pendingVolunteers = await pool.query(
      "SELECT COUNT(*) FROM volunteers WHERE status = 'pending'"
    );

    // Get today's events
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    
    const todaysEvents = await pool.query(
      `SELECT * FROM events 
       WHERE start_date_time >= $1 AND start_date_time < $2 
       AND status = 'active'
       ORDER BY start_date_time ASC`,
      [todayStart, todayEnd]
    );

    // Get events statistics by status
    const eventsStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN start_date_time > NOW() THEN 1 END) as upcoming,
        COUNT(CASE WHEN start_date_time <= NOW() AND end_date_time >= NOW() THEN 1 END) as ongoing,
        COUNT(CASE WHEN end_date_time < NOW() THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
      FROM events
    `);

    res.render("admin/dashboard", {
      eventsCount: parseInt(eventsCount.rows[0].count),
      usersCount: parseInt(usersCount.rows[0].count),
      ticketsCount: parseInt(ticketsCount.rows[0].count),
      totalRevenue: parseFloat(revenueResult.rows[0].total_revenue),
      pendingReports: parseInt(pendingReports.rows[0].count),
      pendingVolunteers: parseInt(pendingVolunteers.rows[0].count),
      recentEvents: recentEvents.rows,
      todaysEvents: todaysEvents.rows,
      eventsStats: eventsStats.rows[0],
      admin: req.session.admin,
      error: null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.render("admin/dashboard", {
      eventsCount: 0,
      usersCount: 0,
      ticketsCount: 0,
      totalRevenue: 0,
      pendingReports: 0,
      pendingVolunteers: 0,
      recentEvents: [],
      todaysEvents: [],
      eventsStats: { total: 0, upcoming: 0, ongoing: 0, completed: 0, cancelled: 0 },
      admin: req.session.admin,
      error: "Failed to load dashboard data",
      success: null
    });
  }
},

  // Admin logout
  logout: (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
      }
      res.render("index");
    });
  },
  // Events list with tabs - UPDATED VERSION
events: async (req, res) => {
  try {
    const { search, tab } = req.query;
    const currentTab = tab || 'upcoming';
    let events;
    let query;
    let queryParams = [];

    const baseQuery = `
      SELECT * FROM events 
      WHERE 1=1
    `;

    // Add search filter
    if (search) {
      queryParams.push(`%${search}%`);
      query = `${baseQuery} AND title ILIKE $${queryParams.length}`;
    } else {
      query = baseQuery;
    }

    // Add tab-specific filters
    const now = new Date();
    switch (currentTab) {
      case 'upcoming':
        query += ` AND start_date_time > $${queryParams.length + 1} AND status = 'active'`;
        queryParams.push(now);
        break;
      case 'inprogress':
        query += ` AND start_date_time <= $${queryParams.length + 1} AND end_date_time >= $${queryParams.length + 2} AND status = 'active'`;
        queryParams.push(now, now);
        break;
      case 'ended':
        query += ` AND end_date_time < $${queryParams.length + 1} AND status = 'active'`;
        queryParams.push(now);
        break;
      case 'cancelled':
        query += ` AND status = 'cancelled'`;
        break;
      default:
        query += ` AND status = 'active'`;
    }

    query += ` ORDER BY start_date_time ${currentTab === 'ended' || currentTab === 'cancelled' ? 'DESC' : 'ASC'}`;

    events = await pool.query(query, queryParams);

    res.render("admin/event", {
      events: events.rows,
      searchQuery: search || "",
      currentTab: currentTab,
      error: null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error("Events error:", error);
    res.render("admin/event", {
      events: [],
      searchQuery: "",
      currentTab: 'upcoming',
      error: "Internal server error. Please try again.",
      success: null
    });
  }
},

  // Show add event form
  showAddEvent: (req, res) => {
    res.render("admin/add_event", {
      error: null,
      formData: {},
      success: null,
    });
  },

  // Add event
  addEvent: async (req, res) => {
    try {
      const {
        title,
        description,
        start_date_time,
        end_date_time,
        venue,
        entrance_fee,
        payment_type,
        volunteers_allowed,
      } = req.body;

      // Validate required fields
      if (!title || !start_date_time || !end_date_time) {
        return res.render("admin/add_event", {
          error: "Title, start date, and end date are required",
          formData: req.body,
          success: null,
        });
      }

      // Validate dates
      const startDate = new Date(start_date_time);
      const endDate = new Date(end_date_time);
      const now = new Date();

      // Check if start date is in the past
      if (startDate < now) {
        return res.render("admin/add_event", {
          error: "Start date cannot be in the past",
          formData: req.body,
          success: null,
        });
      }

      // Check if end date is before start date
      if (endDate <= startDate) {
        return res.render("admin/add_event", {
          error: "End date must be after start date",
          formData: req.body,
          success: null,
        });
      }

      // Determine payment type based on entrance fee
      const entranceFee = parseFloat(entrance_fee) || 0;
      const finalPaymentType = entranceFee > 0 ? "paid" : "free";

      // Handle file upload (you'll need to implement this)
      let coverImage = null;
      if (req.file) {
        coverImage = `/uploads/${req.file.filename}`;
      }

      // Insert new event
      const newEvent = await pool.query(
        `INSERT INTO events 
       (title, description, cover_image, start_date_time, end_date_time, venue, entrance_fee, payment_type, volunteers_allowed, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active') 
       RETURNING *`,
        [
          title,
          description,
          coverImage, // This will be null if no file uploaded
          start_date_time,
          end_date_time,
          venue,
          entranceFee,
          finalPaymentType,
          volunteers_allowed === "true",
        ]
      );

      res.redirect("/admin/event?add=success");
    } catch (error) {
      console.error("Add event error:", error);
      res.render("admin/add_event", {
        error: "Internal server error. Please try again.",
        formData: req.body,
        success: null,
      });
    }
  },
  // Show edit event form
  showEditEvent: async (req, res) => {
    try {
      const { id } = req.params;

      const eventResult = await pool.query(
        "SELECT * FROM events WHERE id = $1",
        [id]
      );

      if (eventResult.rows.length === 0) {
        return res.status(404).render("error", { error: "Event not found" });
      }

      res.render("admin/edit_event", {
        event: eventResult.rows[0],
        error: null,
      });
    } catch (error) {
      console.error("Show edit event error:", error);
      res.status(500).render("error", { error: "Internal server error" });
    }
  },

  // Update event
  // Update event
  updateEvent: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        title,
        description,
        start_date_time,
        end_date_time,
        venue,
        entrance_fee,
        volunteers_allowed,
        status,
        remove_image,
      } = req.body;

      // Validate required fields
      if (!title || !start_date_time || !end_date_time) {
        const eventResult = await pool.query(
          "SELECT * FROM events WHERE id = $1",
          [id]
        );

        return res.render("admin/edit_event", {
          event: eventResult.rows[0],
          error: "Title, start date, and end date are required",
        });
      }

      // Validate dates
      const startDate = new Date(start_date_time);
      const endDate = new Date(end_date_time);
      const now = new Date();

      // Check if start date is in the past (allow for existing events)
      const existingEvent = await pool.query(
        "SELECT start_date_time FROM events WHERE id = $1",
        [id]
      );

      const originalStartDate = new Date(existingEvent.rows[0].start_date_time);
      if (
        startDate < now &&
        startDate.getTime() !== originalStartDate.getTime()
      ) {
        const eventResult = await pool.query(
          "SELECT * FROM events WHERE id = $1",
          [id]
        );

        return res.render("admin/edit_event", {
          event: eventResult.rows[0],
          error: "Start date cannot be changed to a past date",
        });
      }

      // Check if end date is before start date
      if (endDate <= startDate) {
        const eventResult = await pool.query(
          "SELECT * FROM events WHERE id = $1",
          [id]
        );

        return res.render("admin/edit_event", {
          event: eventResult.rows[0],
          error: "End date must be after start date",
        });
      }

      // Determine payment type based on entrance fee
      const entranceFee = parseFloat(entrance_fee) || 0;
      const paymentType = entranceFee > 0 ? "paid" : "free";

      // Handle cover image
      let coverImage = null;
      if (req.file) {
        coverImage = `/uploads/${req.file.filename}`;
      } else if (remove_image === "on") {
        coverImage = null;
      } else {
        // Keep existing image if not changed
        const existingEvent = await pool.query(
          "SELECT cover_image FROM events WHERE id = $1",
          [id]
        );
        coverImage = existingEvent.rows[0].cover_image;
      }

      // Build update query
      let query =
        "UPDATE events SET title = $1, description = $2, start_date_time = $3, end_date_time = $4, venue = $5, entrance_fee = $6, payment_type = $7, volunteers_allowed = $8, status = $9";
      let values = [
        title,
        description,
        start_date_time,
        end_date_time,
        venue,
        entrance_fee,
        paymentType,
        volunteers_allowed === "true",
        status,
      ];
      let valueIndex = 10;

      if (coverImage !== undefined) {
        query += `, cover_image = $${valueIndex}`;
        values.push(coverImage);
        valueIndex++;
      }

      query += ` WHERE id = $${valueIndex} RETURNING *`;
      values.push(id);

      // Update event
      const updatedEvent = await pool.query(query, values);

      res.redirect(`/admin/event/${id}/edit?update=success`);
    } catch (error) {
      console.error("Update event error:", error);

      const eventResult = await pool.query(
        "SELECT * FROM events WHERE id = $1",
        [req.params.id]
      );

      res.render("admin/edit_event", {
        event: eventResult.rows[0],
        error: "Internal server error. Please try again.",
      });
    }
  },
  // View event details
  viewEvent: async (req, res) => {
    try {
      const { id } = req.params;

      // Get event details
      const eventResult = await pool.query(
        "SELECT * FROM events WHERE id = $1",
        [id]
      );

      if (eventResult.rows.length === 0) {
        return res.status(404).render("error", { error: "Event not found" });
      }

      const event = eventResult.rows[0];

      // Get comments with user info and replies
      const commentsResult = await pool.query(
        `
      SELECT 
        c.*,
        u.first_name,
        u.last_name,
        u.user_type,
        (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.reaction_type = 'like') as likes,
        (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.reaction_type = 'dislike') as dislikes
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.event_id = $1 AND c.parent_comment IS NULL AND c.is_deleted = false
      ORDER BY c.created_at DESC
    `,
        [id]
      );

      const comments = commentsResult.rows;

      // Get replies for each comment
      for (let comment of comments) {
        const repliesResult = await pool.query(
          `
        SELECT 
          c.*,
          u.first_name,
          u.last_name,
          u.user_type,
          (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.reaction_type = 'like') as likes,
          (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.reaction_type = 'dislike') as dislikes
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.parent_comment = $1 AND c.is_deleted = false
        ORDER BY c.created_at ASC
      `,
          [comment.id]
        );

        comment.replies = repliesResult.rows;
      }

      res.render("admin/view_event", {
        event,
        comments,
        admin: req.session.admin,
      });
    } catch (error) {
      console.error("View event error:", error);
      res.status(500).render("error", { error: "Internal server error" });
    }
  },

  // Add comment
  addComment: async (req, res) => {
    try {
      const { event_id, comment, parent_comment } = req.body;
      const user_id = req.session.admin.id;

      if (!event_id || !comment) {
        return res
          .status(400)
          .json({ error: "Event ID and comment are required" });
      }

      const newComment = await pool.query(
        `INSERT INTO comments (user_id, event_id, comment, parent_comment) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
        [user_id, event_id, comment, parent_comment || null]
      );

      res.json({ success: true, comment: newComment.rows[0] });
    } catch (error) {
      console.error("Add comment error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Edit comment
  editComment: async (req, res) => {
    try {
      const { id } = req.params;
      const { comment } = req.body;
      const user_id = req.session.admin.id;

      // Check if comment exists and belongs to user or user is admin
      const existingComment = await pool.query(
        "SELECT * FROM comments WHERE id = $1 AND is_deleted = false",
        [id]
      );

      if (existingComment.rows.length === 0) {
        return res.status(404).json({ error: "Comment not found" });
      }

      const commentData = existingComment.rows[0];

      // Allow edit only if user owns the comment or is admin
      if (
        commentData.user_id !== user_id &&
        req.session.admin.userType !== "admin"
      ) {
        return res
          .status(403)
          .json({ error: "Not authorized to edit this comment" });
      }

      const updatedComment = await pool.query(
        "UPDATE comments SET comment = $1 WHERE id = $2 RETURNING *",
        [comment, id]
      );

      res.json({ success: true, comment: updatedComment.rows[0] });
    } catch (error) {
      console.error("Edit comment error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Delete comment
  deleteComment: async (req, res) => {
    try {
      const { id } = req.params;
      const user_id = req.session.admin.id;

      // Check if comment exists
      const existingComment = await pool.query(
        "SELECT * FROM comments WHERE id = $1 AND is_deleted = false",
        [id]
      );

      if (existingComment.rows.length === 0) {
        return res.status(404).json({ error: "Comment not found" });
      }

      // Only admin can delete any comment
      if (req.session.admin.userType !== "admin") {
        return res
          .status(403)
          .json({ error: "Only admins can delete comments" });
      }

      // Soft delete the comment
      await pool.query(
        "UPDATE comments SET is_deleted = true, deleted_at = NOW(), deleted_by = $1 WHERE id = $2",
        [user_id, id]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Delete comment error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Add reaction to comment
  addReaction: async (req, res) => {
    try {
      const { id } = req.params;
      const { reaction_type } = req.body;
      const user_id = req.session.admin.id;

      // Check if reaction already exists
      const existingReaction = await pool.query(
        "SELECT * FROM comment_reactions WHERE user_id = $1 AND comment_id = $2",
        [user_id, id]
      );

      if (existingReaction.rows.length > 0) {
        // Update existing reaction
        await pool.query(
          "UPDATE comment_reactions SET reaction_type = $1 WHERE user_id = $2 AND comment_id = $3",
          [reaction_type, user_id, id]
        );
      } else {
        // Add new reaction
        await pool.query(
          "INSERT INTO comment_reactions (user_id, comment_id, reaction_type) VALUES ($1, $2, $3)",
          [user_id, id, reaction_type]
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Add reaction error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Remove reaction from comment
  removeReaction: async (req, res) => {
    try {
      const { id } = req.params;
      const { reaction_type } = req.body;
      const user_id = req.session.admin.id;

      await pool.query(
        "DELETE FROM comment_reactions WHERE user_id = $1 AND comment_id = $2 AND reaction_type = $3",
        [user_id, id, reaction_type]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Remove reaction error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
  // View attendees list for an event
  viewAttendees: async (req, res) => {
    try {
      const { id } = req.params;

      // Get event details
      const eventResult = await pool.query(
        "SELECT * FROM events WHERE id = $1",
        [id]
      );

      if (eventResult.rows.length === 0) {
        return res.status(404).render("error", { error: "Event not found" });
      }

      const event = eventResult.rows[0];

      // Get attendees with user information
      const attendeesResult = await pool.query(
        `
      SELECT 
        t.id as ticket_id,
        t.status,
        t.price_paid,
        t.created_at,
        t.updated_at,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.identifier,
        u.user_type
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      WHERE t.event_id = $1
      ORDER BY t.created_at DESC
    `,
        [id]
      );

      const attendees = attendeesResult.rows;

      res.render("admin/attendee_list", {
        event,
        attendees,
        error: null,
      });
    } catch (error) {
      console.error("View attendees error:", error);
      res.render("admin/attendee_list", {
        event: null,
        attendees: [],
        error: "Internal server error. Please try again.",
      });
    }
  },
  // Show assign ticket form
  showAssignTicket: async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`Fetching ticket for ID: ${id}`);

      // Get ticket details with user and event information
      const ticketResult = await pool.query(
        `
      SELECT 
        t.*,
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.identifier,
        u.user_type,
        e.id as event_id,
        e.title as event_title,
        e.start_date_time,
        e.end_date_time,
        e.venue,
        e.cover_image
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      JOIN events e ON t.event_id = e.id
      WHERE t.id = $1
    `,
        [id]
      );

      console.log("Ticket query result:", ticketResult.rows);

      if (ticketResult.rows.length === 0) {
        console.warn("No ticket found for ID:", id);
        return res.status(404).render("error", { error: "Ticket not found" });
      }

      const ticketData = ticketResult.rows[0];

      console.log("ticketData:", ticketData);

      // Prepare data for template
      const ticket = {
        id: ticketData.id,
        status: ticketData.status,
        price_paid: ticketData.price_paid,
        created_at: ticketData.created_at,
        qr_code_url: ticketData.qr_code_url,
        token: ticketData.token,
      };

      const user = {
        id: ticketData.user_id,
        first_name: ticketData.first_name,
        last_name: ticketData.last_name,
        identifier: ticketData.identifier,
        user_type: ticketData.user_type,
      };

      const event = {
        id: ticketData.event_id,
        title: ticketData.event_title,
        start_date_time: ticketData.start_date_time,
        end_date_time: ticketData.end_date_time,
        venue: ticketData.venue,
        cover_image: ticketData.cover_image,
      };

      console.log(
        "Prepared template data -> ticket:",
        ticket,
        "user:",
        user,
        "event:",
        event
      );

      res.render("admin/assign_ticket", {
        ticket,
        user,
        event,
        error: null,
      });
    } catch (error) {
      console.error("Show assign ticket error:", error);
      res.status(500).render("error", { error: "Internal server error" });
    }
  },

  // Assign ticket (generate QR and update status)
  assignTicket: async (req, res) => {
    try {
      const { id } = req.params;
      const { qr_code_data, status } = req.body;

      // Import crypto properly for ES modules
      const crypto = await import("crypto");

      // Generate unique token for the ticket
      const token = crypto.randomBytes(32).toString("hex");

      // Update ticket with QR code data, token, and status
      const updatedTicket = await pool.query(
        `
        UPDATE tickets 
        SET status = $1, 
            qr_code_data = $2,
            token = $3,
            updated_at = NOW()
        WHERE id = $4 
        RETURNING *
      `,
        [status, qr_code_data, token, id]
      );

      if (updatedTicket.rows.length === 0) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      res.json({
        success: true,
        ticket: updatedTicket.rows[0],
        message: "Ticket assigned successfully",
      });
    } catch (error) {
      console.error("Assign ticket error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
  // Show view ticket form
  showViewTicket: async (req, res) => {
    try {
      const { id } = req.params;

      // Get ticket details with user and event information
      const ticketResult = await pool.query(
        `
      SELECT 
        t.*,
        u.first_name,
        u.last_name,
        u.identifier,
        u.user_type,
        e.id as event_id,
        e.title as event_title,
        e.start_date_time,
        e.end_date_time,
        e.venue,
        e.cover_image
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      JOIN events e ON t.event_id = e.id
      WHERE t.id = $1
    `,
        [id]
      );

      if (ticketResult.rows.length === 0) {
        return res.status(404).render("error", { error: "Ticket not found" });
      }

      const ticketData = ticketResult.rows[0];

      // Prepare data for template
      const ticket = {
        id: ticketData.id,
        status: ticketData.status,
        price_paid: ticketData.price_paid,
        created_at: ticketData.created_at,
        updated_at: ticketData.updated_at,
        qr_code_data: ticketData.qr_code_data,
        qr_code_url: ticketData.qr_code_url,
        token: ticketData.token,
      };

      const user = {
        id: ticketData.user_id,
        first_name: ticketData.first_name,
        last_name: ticketData.last_name,
        identifier: ticketData.identifier,
        user_type: ticketData.user_type,
      };

      const event = {
        id: ticketData.event_id,
        title: ticketData.event_title,
        start_date_time: ticketData.start_date_time,
        end_date_time: ticketData.end_date_time,
        venue: ticketData.venue,
        cover_image: ticketData.cover_image,
      };

      res.render("admin/view_ticket", {
        ticket,
        user,
        event,
        error: null,
      });
    } catch (error) {
      console.error("Show view ticket error:", error);
      res.status(500).render("error", { error: "Internal server error" });
    }
  },

  // Mark ticket as scanned
  markTicketScanned: async (req, res) => {
    try {
      const { id } = req.params;

      const updatedTicket = await pool.query(
        `
      UPDATE tickets 
      SET status = 'scanned', 
          updated_at = NOW()
      WHERE id = $1 
      RETURNING *
    `,
        [id]
      );

      if (updatedTicket.rows.length === 0) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      res.json({
        success: true,
        ticket: updatedTicket.rows[0],
        message: "Ticket marked as scanned successfully",
      });
    } catch (error) {
      console.error("Mark ticket scanned error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Reset ticket to sent status
  resetTicket: async (req, res) => {
    try {
      const { id } = req.params;

      const updatedTicket = await pool.query(
        `
      UPDATE tickets 
      SET status = 'sent', 
          updated_at = NOW()
      WHERE id = $1 
      RETURNING *
    `,
        [id]
      );

      if (updatedTicket.rows.length === 0) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      res.json({
        success: true,
        ticket: updatedTicket.rows[0],
        message: "Ticket reset to sent status successfully",
      });
    } catch (error) {
      console.error("Reset ticket error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
  // Wallet Management
  manageWallets: async (req, res) => {
    try {
      const { search, user_type } = req.query;
      let query = `
      SELECT id, first_name, last_name, identifier, user_type, wallet, status, created_at
      FROM users 
      WHERE user_type != 'admin'
    `;
      let queryParams = [];
      let conditions = [];

      // Add search filter
      if (search) {
        conditions.push(
          `(first_name ILIKE $${queryParams.length + 1} OR last_name ILIKE $${
            queryParams.length + 1
          } OR identifier ILIKE $${queryParams.length + 1})`
        );
        queryParams.push(`%${search}%`);
      }

      // Add user type filter
      if (user_type && user_type !== "all") {
        conditions.push(`user_type = $${queryParams.length + 1}`);
        queryParams.push(user_type);
      }

      // Add conditions to query
      if (conditions.length > 0) {
        query += ` AND ${conditions.join(" AND ")}`;
      }

      query += ` ORDER BY created_at DESC`;

      const usersResult = await pool.query(query, queryParams);

      res.render("admin/manage_wallet", {
        users: usersResult.rows,
        searchQuery: search || "",
        userTypeFilter: user_type || "all",
        error: null,
        success: req.query.success || null,
      });
    } catch (error) {
      console.error("Manage wallets error:", error);
      res.render("admin/manage_wallet", {
        users: [],
        searchQuery: "",
        userTypeFilter: "all",
        error: "Internal server error. Please try again.",
        success: null,
      });
    }
  },

  // Show deposit form
  showDeposit: async (req, res) => {
    try {
      const { id } = req.params;

      const userResult = await pool.query(
        "SELECT id, first_name, last_name, identifier, user_type, wallet FROM users WHERE id = $1",
        [id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).render("error", { error: "User not found" });
      }

      res.render("admin/deposit", {
        user: userResult.rows[0],
        error: null,
        formData: {},
      });
    } catch (error) {
      console.error("Show deposit error:", error);
      res.status(500).render("error", { error: "Internal server error" });
    }
  },

  // Process deposit
  processDeposit: async (req, res) => {
    try {
      const { id } = req.params;
      const { amount, description } = req.body;

      // Validate input
      if (!amount || parseFloat(amount) <= 0) {
        const userResult = await pool.query(
          "SELECT id, first_name, last_name, identifier, user_type, wallet FROM users WHERE id = $1",
          [id]
        );

        return res.render("admin/deposit", {
          user: userResult.rows[0],
          error: "Please enter a valid amount",
          formData: req.body,
        });
      }

      const depositAmount = parseFloat(amount);

      // Start transaction
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // Get current wallet balance
        const userResult = await client.query(
          "SELECT wallet FROM users WHERE id = $1 FOR UPDATE",
          [id]
        );

        if (userResult.rows.length === 0) {
          throw new Error("User not found");
        }

        const currentBalance = parseFloat(userResult.rows[0].wallet);
        const newBalance = currentBalance + depositAmount;

        // Update user's wallet
        await client.query("UPDATE users SET wallet = $1 WHERE id = $2", [
          newBalance,
          id,
        ]);

        // Create transaction record (you might want to create a transactions table)
        // For now, we'll just update the wallet

        await client.query("COMMIT");

        res.redirect(
          `/admin/wallets?success=Deposit of $${depositAmount.toFixed(
            2
          )} completed successfully`
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Process deposit error:", error);

      const userResult = await pool.query(
        "SELECT id, first_name, last_name, identifier, user_type, wallet FROM users WHERE id = $1",
        [req.params.id]
      );

      res.render("admin/deposit", {
        user: userResult.rows[0],
        error: "Internal server error. Please try again.",
        formData: req.body,
      });
    }
  },

  // Show withdrawal form (optional - if you want admins to be able to withdraw funds)
  showWithdrawal: async (req, res) => {
    try {
      const { id } = req.params;

      const userResult = await pool.query(
        "SELECT id, first_name, last_name, identifier, user_type, wallet FROM users WHERE id = $1",
        [id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).render("error", { error: "User not found" });
      }

      res.render("admin/withdrawal", {
        user: userResult.rows[0],
        error: null,
        formData: {},
      });
    } catch (error) {
      console.error("Show withdrawal error:", error);
      res.status(500).render("error", { error: "Internal server error" });
    }
  },

  // Process withdrawal (optional)
  processWithdrawal: async (req, res) => {
    try {
      const { id } = req.params;
      const { amount, description } = req.body;

      // Validate input
      if (!amount || parseFloat(amount) <= 0) {
        const userResult = await pool.query(
          "SELECT id, first_name, last_name, identifier, user_type, wallet FROM users WHERE id = $1",
          [id]
        );

        return res.render("admin/withdrawal", {
          user: userResult.rows[0],
          error: "Please enter a valid amount",
          formData: req.body,
        });
      }

      const withdrawalAmount = parseFloat(amount);

      // Start transaction
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // Get current wallet balance
        const userResult = await client.query(
          "SELECT wallet FROM users WHERE id = $1 FOR UPDATE",
          [id]
        );

        if (userResult.rows.length === 0) {
          throw new Error("User not found");
        }

        const currentBalance = parseFloat(userResult.rows[0].wallet);

        // Check if user has sufficient funds
        if (currentBalance < withdrawalAmount) {
          throw new Error("Insufficient funds");
        }

        const newBalance = currentBalance - withdrawalAmount;

        // Update user's wallet
        await client.query("UPDATE users SET wallet = $1 WHERE id = $2", [
          newBalance,
          id,
        ]);

        await client.query("COMMIT");

        res.redirect(
          `/admin/wallets?success=Withdrawal of $${withdrawalAmount.toFixed(
            2
          )} completed successfully`
        );
      } catch (error) {
        await client.query("ROLLBACK");

        const userResult = await pool.query(
          "SELECT id, first_name, last_name, identifier, user_type, wallet FROM users WHERE id = $1",
          [id]
        );

        return res.render("admin/withdrawal", {
          user: userResult.rows[0],
          error:
            error.message === "Insufficient funds"
              ? "User has insufficient funds for this withdrawal"
              : "Internal server error. Please try again.",
          formData: req.body,
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Process withdrawal error:", error);

      const userResult = await pool.query(
        "SELECT id, first_name, last_name, identifier, user_type, wallet FROM users WHERE id = $1",
        [req.params.id]
      );

      res.render("admin/withdrawal", {
        user: userResult.rows[0],
        error: "Internal server error. Please try again.",
        formData: req.body,
      });
    }
  },
  // User Management
  manageUsers: async (req, res) => {
    try {
      const { search, user_type, status } = req.query;
      let query = `
      SELECT id, first_name, last_name, identifier, user_type, status, reason, created_at
      FROM users 
      WHERE user_type != 'admin'
    `;
      let queryParams = [];
      let conditions = [];

      // Add search filter
      if (search) {
        conditions.push(
          `(first_name ILIKE $${queryParams.length + 1} OR last_name ILIKE $${
            queryParams.length + 1
          } OR identifier ILIKE $${queryParams.length + 1})`
        );
        queryParams.push(`%${search}%`);
      }

      // Add user type filter
      if (user_type && user_type !== "all") {
        conditions.push(`user_type = $${queryParams.length + 1}`);
        queryParams.push(user_type);
      }

      // Add status filter
      if (status && status !== "all") {
        conditions.push(`status = $${queryParams.length + 1}`);
        queryParams.push(status);
      }

      // Add conditions to query
      if (conditions.length > 0) {
        query += ` AND ${conditions.join(" AND ")}`;
      }

      query += ` ORDER BY created_at DESC`;

      const usersResult = await pool.query(query, queryParams);

      res.render("admin/manage_users", {
        users: usersResult.rows,
        searchQuery: search || "",
        userTypeFilter: user_type || "all",
        statusFilter: status || "all",
        error: null,
        success: req.query.success || null,
      });
    } catch (error) {
      console.error("Manage users error:", error);
      res.render("admin/manage_users", {
        users: [],
        searchQuery: "",
        userTypeFilter: "all",
        statusFilter: "all",
        error: "Internal server error. Please try again.",
        success: null,
      });
    }
  },

  // View user details
  viewUser: async (req, res) => {
    try {
      const { id } = req.params;

      const userResult = await pool.query(
        `SELECT id, first_name, last_name, identifier, user_type, status, reason, wallet, created_at
       FROM users WHERE id = $1`,
        [id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).render("error", { error: "User not found" });
      }

      // Get user's ticket history
      const ticketsResult = await pool.query(
        `SELECT t.*, e.title as event_title, e.start_date_time
       FROM tickets t
       JOIN events e ON t.event_id = e.id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT 10`,
        [id]
      );

      // Get user's recent comments
      const commentsResult = await pool.query(
        `SELECT c.*, e.title as event_title
       FROM comments c
       JOIN events e ON c.event_id = e.id
       WHERE c.user_id = $1 AND c.is_deleted = false
       ORDER BY c.created_at DESC
       LIMIT 5`,
        [id]
      );

      res.render("admin/user_details", {
        user: userResult.rows[0],
        tickets: ticketsResult.rows,
        comments: commentsResult.rows,
        error: null,
        success: req.query.success || null,
      });
    } catch (error) {
      console.error("View user error:", error);
      res.status(500).render("error", { error: "Internal server error" });
    }
  },

  // Ban user
  banUser: async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      // Validate reason
      if (!reason || reason.trim().length === 0) {
        return res.redirect(
          `/admin/user/${id}?error=Reason is required for banning a user`
        );
      }

      // Update user status and reason
      await pool.query(
        "UPDATE users SET status = 'banned', reason = $1 WHERE id = $2",
        [reason.trim(), id]
      );

      res.redirect(
        `/admin/user/${id}?success=User has been banned successfully`
      );
    } catch (error) {
      console.error("Ban user error:", error);
      res.redirect(`/admin/user/${id}?error=Internal server error`);
    }
  },

  // Unban user
  unbanUser: async (req, res) => {
    try {
      const { id } = req.params;

      // Update user status to active and clear reason
      await pool.query(
        "UPDATE users SET status = 'active', reason = NULL WHERE id = $1",
        [id]
      );

      res.redirect(
        `/admin/user/${id}?success=User has been unbanned successfully`
      );
    } catch (error) {
      console.error("Unban user error:", error);
      res.redirect(`/admin/user/${id}?error=Internal server error`);
    }
  },

  // Delete user (optional - soft delete)
  deleteUser: async (req, res) => {
    try {
      const { id } = req.params;

      // Check if user has any related records before deleting
      const ticketsCount = await pool.query(
        "SELECT COUNT(*) FROM tickets WHERE user_id = $1",
        [id]
      );

      const commentsCount = await pool.query(
        "SELECT COUNT(*) FROM comments WHERE user_id = $1",
        [id]
      );

      // Instead of hard delete, we can soft delete or just deactivate
      await pool.query(
        "UPDATE users SET status = 'banned', reason = 'Account deleted by admin' WHERE id = $1",
        [id]
      );

      res.redirect("/admin/users?success=User account has been deactivated");
    } catch (error) {
      console.error("Delete user error:", error);
      res.redirect("/admin/users?error=Internal server error");
    }
  },
  // Report Management

manageReports: async (req, res) => {
    try {
        const { status, type, photo_id } = req.query;
        let query = `
            SELECT 
                r.*,
                reporter.first_name as reporter_first_name,
                reporter.last_name as reporter_last_name,
                reporter.identifier as reporter_identifier,
                reported.first_name as reported_first_name,
                reported.last_name as reported_last_name,
                reported.identifier as reported_identifier,
                reported.status as reported_user_status,
                c.comment as reported_comment,
                c.created_at as comment_created_at,
                e.title as event_title,
                e.id as event_id,
                pw.image_url as photo_url,
                pw.caption as photo_caption
            FROM reports r
            JOIN users reporter ON r.reporter_id = reporter.id
            JOIN users reported ON r.reported_user_id = reported.id
            LEFT JOIN comments c ON r.comment_id = c.id
            LEFT JOIN events e ON c.event_id = e.id
            LEFT JOIN photo_wall pw ON r.photo_wall_id = pw.id
            WHERE 1=1
        `;
        let queryParams = [];
        let conditions = [];

        // Add photo filter if specified
        if (photo_id) {
            conditions.push(`r.photo_wall_id = $${queryParams.length + 1}`);
            queryParams.push(photo_id);
        }

        // Add status filter
        if (status && status !== "all") {
            conditions.push(`r.status = $${queryParams.length + 1}`);
            queryParams.push(status);
        }

        // Add type filter
        if (type && type !== "all") {
            conditions.push(`r.report_type = $${queryParams.length + 1}`);
            queryParams.push(type);
        }

        // Add conditions to query
        if (conditions.length > 0) {
            query += ` AND ${conditions.join(" AND ")}`;
        }

        query += ` ORDER BY r.created_at DESC`;

        const reportsResult = await pool.query(query, queryParams);

        // Get report statistics
        const statsResult = await pool.query(`
            SELECT 
                status,
                COUNT(*) as count
            FROM reports 
            GROUP BY status
        `);

        const stats = {
            pending: 0,
            investigating: 0,
            resolved: 0,
            dismissed: 0,
        };

        statsResult.rows.forEach((stat) => {
            stats[stat.status] = parseInt(stat.count);
        });

        res.render("admin/manage_reports", {
            reports: reportsResult.rows,
            stats: stats,
            statusFilter: status || "all",
            typeFilter: type || "all",
            // Remove categoryFilter since we don't have it in the query
            error: null,
            success: req.query.success || null,
        });
    } catch (error) {
        console.error("Manage reports error:", error);
        res.render("admin/manage_reports", {
            reports: [],
            stats: { pending: 0, investigating: 0, resolved: 0, dismissed: 0 },
            statusFilter: "all",
            typeFilter: "all",
            error: "Internal server error. Please try again.",
            success: null,
        });
    }
},

  // View report details
  viewReport: async (req, res) => {
    try {
      const { id } = req.params;

      const reportResult = await pool.query(
        `
        SELECT 
          r.*,
          reporter.first_name as reporter_first_name,
          reporter.last_name as reporter_last_name,
          reporter.identifier as reporter_identifier,
          reporter.id as reporter_id,
          reported.first_name as reported_first_name,
          reported.last_name as reported_last_name,
          reported.identifier as reported_identifier,
          reported.id as reported_user_id,
          reported.status as reported_user_status,
          c.comment as reported_comment,
          c.id as comment_id,
          c.created_at as comment_created_at,
          c.likes as comment_likes,
          c.dislikes as comment_dislikes,
          e.title as event_title,
          e.id as event_id,
          pw.image_url as photo_url,
          pw.caption as photo_caption,
          pw.id as photo_id
        FROM reports r
        JOIN users reporter ON r.reporter_id = reporter.id
        JOIN users reported ON r.reported_user_id = reported.id
        LEFT JOIN comments c ON r.comment_id = c.id
        LEFT JOIN events e ON c.event_id = e.id
        LEFT JOIN photo_wall pw ON r.photo_wall_id = pw.id
        WHERE r.id = $1
      `,
        [id]
      );

      if (reportResult.rows.length === 0) {
        return res.status(404).render("error", { error: "Report not found" });
      }

      const report = reportResult.rows[0];

      // Get other reports for the same user
      const userReportsResult = await pool.query(
        `
        SELECT COUNT(*) as total_reports 
        FROM reports 
        WHERE reported_user_id = $1 AND status != 'dismissed'
      `,
        [report.reported_user_id]
      );

      res.render("admin/report_details", {
        report: report,
        totalUserReports: parseInt(userReportsResult.rows[0].total_reports),
        error: null,
        success: req.query.success || null,
      });
    } catch (error) {
      console.error("View report error:", error);
      res.status(500).render("error", { error: "Internal server error" });
    }
  },

 // Update report status
updateReportStatus: async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_response } = req.body;
    const adminId = req.session.admin.id;

    // Validate status
    const validStatuses = [
      "pending",
      "investigating",
      "resolved",
      "dismissed",
    ];
    if (!validStatuses.includes(status)) {
      return res.redirect(`/admin/report/${id}?error=Invalid status`);
    }

    let query;
    let values;

    if (status === "resolved" || status === "dismissed") {
      // If resolving or dismissing, require admin response and set resolved info
      if (!admin_response || admin_response.trim().length === 0) {
        return res.redirect(
          `/admin/report/${id}?error=Admin response is required when resolving or dismissing a report`
        );
      }

      query = `
        UPDATE reports 
        SET status = $1, 
            admin_response = $2,
            resolved_by = $3,
            resolved_at = NOW(),
            updated_at = NOW(),
            notified = true  -- Mark as notified so user gets notification
        WHERE id = $4
      `;
      values = [status, admin_response.trim(), adminId, id];
    } else {
      // For other status changes, just update status
      query = `
        UPDATE reports 
        SET status = $1, 
            updated_at = NOW(),
            notified = false  -- Reset notified status for non-final statuses
        WHERE id = $2
      `;
      values = [status, id];
    }

    await pool.query(query, values);

    const successMessage =
      status === "resolved"
        ? "Report marked as resolved and user has been notified"
        : status === "dismissed"
        ? "Report dismissed and user has been notified"
        : `Report status updated to ${status}`;

    res.redirect(
      `/admin/report/${id}?success=${encodeURIComponent(successMessage)}`
    );
  } catch (error) {
    console.error("Update report status error:", error);
    res.redirect(`/admin/report/${id}?error=Internal server error`);
  }
},
  // Delete comment from report (with optional ban)
  deleteReportedComment: async (req, res) => {
    try {
      const { id } = req.params;
      const { ban_user, ban_reason } = req.body;
      const adminId = req.session.admin.id;

      // Get report details first
      const reportResult = await pool.query(
        `
        SELECT comment_id, reported_user_id, photo_wall_id
        FROM reports 
        WHERE id = $1
      `,
        [id]
      );

      if (reportResult.rows.length === 0) {
        return res.status(404).json({ error: "Report not found" });
      }

      const { comment_id, reported_user_id, photo_wall_id } = reportResult.rows[0];
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        if (comment_id) {
          // Soft delete the comment
          await client.query(
            `UPDATE comments 
             SET is_deleted = true, deleted_at = NOW(), deleted_by = $1 
             WHERE id = $2`,
            [adminId, comment_id]
          );
        }

        if (photo_wall_id) {
          // Delete the reported photo
          await client.query(
            `DELETE FROM photo_wall WHERE id = $1`,
            [photo_wall_id]
          );
          // Also delete related likes and reports
          await client.query("DELETE FROM photo_wall_likes WHERE photo_wall_id = $1", [photo_wall_id]);
          await client.query("DELETE FROM reports WHERE photo_wall_id = $1", [photo_wall_id]);
        }

        // Ban user if requested
        if (ban_user === "true" && ban_reason) {
          await client.query(
            `UPDATE users 
             SET status = 'banned', reason = $1 
             WHERE id = $2`,
            [ban_reason, reported_user_id]
          );
        }

        // Update report status to resolved
        await client.query(
          `UPDATE reports 
           SET status = 'resolved', 
               admin_response = $1,
               resolved_by = $2,
               resolved_at = NOW()
           WHERE id = $3`,
          [
            (comment_id ? "Comment has been removed" : "Photo has been removed") +
            (ban_user === "true" ? " and user has been banned" : ""),
            adminId,
            id,
          ]
        );

        await client.query("COMMIT");

        res.redirect(
          `/admin/report/${id}?success=${comment_id ? 'Comment' : 'Photo'} deleted successfully${
            ban_user === "true" ? " and user has been banned" : ""
          }`
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Delete reported content error:", error);
      res.redirect(`/admin/report/${id}?error=Internal server error`);
    }
  },
  // Admin Photo Wall
photoWall: async (req, res) => {
    try {
      const { id } = req.params;

      // Get event details
      const eventResult = await pool.query(
        "SELECT * FROM events WHERE id = $1",
        [id]
      );

      if (eventResult.rows.length === 0) {
        return res.status(404).render("error", { error: "Event not found" });
      }

      const event = eventResult.rows[0];

      // Get all photos for this event with user info and report counts
      const photosResult = await pool.query(`
        SELECT 
          pw.*,
          u.first_name,
          u.last_name,
          u.identifier,
          u.id as user_id,
          COUNT(DISTINCT pwl.id) as hearts_count,
          (SELECT COUNT(*) FROM reports r WHERE r.photo_wall_id = pw.id AND r.report_category = 'photo_wall') as report_count
        FROM photo_wall pw
        JOIN users u ON pw.user_id = u.id
        LEFT JOIN photo_wall_likes pwl ON pw.id = pwl.photo_wall_id
        WHERE pw.event_id = $1 AND pw.is_deleted = false
        GROUP BY pw.id, u.first_name, u.last_name, u.identifier, u.id
        ORDER BY pw.created_at DESC
      `, [id]);

      res.render("admin/photo_wall", {
        event,
        photos: photosResult.rows,
        error: req.query.error || null,
        success: req.query.success || null
      });
    } catch (error) {
      console.error("Admin photo wall error:", error);
      res.status(500).render("error", { error: "Internal server error" });
    }
  },

  // Delete photo (admin only - hard delete)
  deletePhoto: async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.session.admin.id;

      // Get photo details for logging
      const photoResult = await pool.query(
        "SELECT * FROM photo_wall WHERE id = $1",
        [id]
      );

      if (photoResult.rows.length === 0) {
        return res.status(404).json({ error: "Photo not found" });
      }

      const photo = photoResult.rows[0];

      // Delete photo (hard delete for admin)
      await pool.query("DELETE FROM photo_wall WHERE id = $1", [id]);

      // Also delete related likes and reports
      await pool.query("DELETE FROM photo_wall_likes WHERE photo_wall_id = $1", [id]);
      await pool.query("DELETE FROM reports WHERE photo_wall_id = $1", [id]);

      // You might want to delete the actual file from storage here
      // fs.unlinkSync(path.join(__dirname, '../public', photo.image_url));

      res.json({ success: true, message: "Photo deleted successfully" });
    } catch (error) {
      console.error("Delete photo error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

// Add cancel event function
cancelEvent: async (req, res) => {
  try {
    const { id } = req.params;

    // Get event details first
    const eventResult = await pool.query(
      "SELECT * FROM events WHERE id = $1",
      [id]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    const event = eventResult.rows[0];

    // Check if event is already cancelled
    if (event.status === 'cancelled') {
      return res.status(400).json({ error: "Event is already cancelled" });
    }

    // Update event status to cancelled
    await pool.query(
      "UPDATE events SET status = 'cancelled' WHERE id = $1",
      [id]
    );

    res.json({ 
      success: true, 
      message: "Event cancelled successfully",
      event: { ...event, status: 'cancelled' }
    });
  } catch (error) {
    console.error("Cancel event error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},
// Get event attendees count (helper function)
getEventAttendeesCount: async (eventId) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) FROM tickets WHERE event_id = $1",
      [eventId]
    );
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error("Error getting attendees count:", error);
    return 0;
  }
},

// Get event volunteers count (helper function)
getEventVolunteersCount: async (eventId) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) FROM volunteers WHERE event_id = $1 AND status = 'accepted'",
      [eventId]
    );
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error("Error getting volunteers count:", error);
    return 0;
  }
},

// Update the viewEvent method to include counts
viewEvent: async (req, res) => {
  try {
    const { id } = req.params;

    // Get event details
    const eventResult = await pool.query(
      "SELECT * FROM events WHERE id = $1",
      [id]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).render("error", { error: "Event not found" });
    }

    const event = eventResult.rows[0];

    // Get attendees count
    const attendeesCount = await adminController.getEventAttendeesCount(id);
    
    // Get volunteers count
    const volunteersCount = await adminController.getEventVolunteersCount(id);

    // Get comments with user info and replies
    const commentsResult = await pool.query(
      `
      SELECT 
        c.*,
        u.first_name,
        u.last_name,
        u.user_type,
        (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.reaction_type = 'like') as likes,
        (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.reaction_type = 'dislike') as dislikes
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.event_id = $1 AND c.parent_comment IS NULL AND c.is_deleted = false
      ORDER BY c.created_at DESC
    `,
      [id]
    );

    const comments = commentsResult.rows;

    // Get replies for each comment
    for (let comment of comments) {
      const repliesResult = await pool.query(
        `
        SELECT 
          c.*,
          u.first_name,
          u.last_name,
          u.user_type,
          (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.reaction_type = 'like') as likes,
          (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.reaction_type = 'dislike') as dislikes
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.parent_comment = $1 AND c.is_deleted = false
        ORDER BY c.created_at ASC
      `,
        [comment.id]
      );

      comment.replies = repliesResult.rows;
    }

    res.render("admin/view_event", {
      event,
      comments,
      admin: req.session.admin,
      attendeesCount: attendeesCount,
      volunteersCount: volunteersCount
    });
  } catch (error) {
    console.error("View event error:", error);
    res.status(500).render("error", { error: "Internal server error" });
  }
},
// View volunteers for an event
viewVolunteers: async (req, res) => {
  try {
    const { id } = req.params;

    // Get event details
    const eventResult = await pool.query(
      "SELECT * FROM events WHERE id = $1",
      [id]
    );

    if (eventResult.rows.length === 0) {
      return res.redirect("/admin/event?error=Event not found");
    }

    const event = eventResult.rows[0];

    // Get all volunteer requests with user information
    const volunteersResult = await pool.query(
      `
      SELECT 
        v.*,
        u.first_name,
        u.last_name,
        u.identifier,
        u.user_type,
        u.status as user_status,
        admin.first_name as responded_by_first_name,
        admin.last_name as responded_by_last_name
      FROM volunteers v
      JOIN users u ON v.user_id = u.id
      LEFT JOIN users admin ON v.responded_by = admin.id
      WHERE v.event_id = $1
      ORDER BY 
        CASE v.status 
          WHEN 'pending' THEN 1
          WHEN 'accepted' THEN 2
          WHEN 'declined' THEN 3
        END,
        v.assigned_at DESC
      `,
      [id]
    );

    const volunteers = volunteersResult.rows;

    // Get counts for each status
    const countsResult = await pool.query(
      `
      SELECT 
        status,
        COUNT(*) as count
      FROM volunteers 
      WHERE event_id = $1 
      GROUP BY status
      `,
      [id]
    );

    const statusCounts = {
      pending: 0,
      accepted: 0,
      declined: 0
    };

    countsResult.rows.forEach(row => {
      statusCounts[row.status] = parseInt(row.count);
    });

    res.render("admin/view_volunteers", {
      event,
      volunteers,
      statusCounts,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error("View volunteers error:", error);
    res.redirect("/admin/event?error=Internal server error while loading volunteers");
  }
},

// Accept volunteer request
acceptVolunteer: async (req, res) => {
  try {
    const { id, volunteerId } = req.params;
    const adminId = req.session.admin.id;

    await pool.query(
      `
      UPDATE volunteers 
      SET status = 'accepted',
          responded_by = $1,
          responded_at = NOW(),
          assigned_at = NOW(),
          admin_response_seen = false
      WHERE id = $2 AND event_id = $1
      `,
      [id, volunteerId]
    );

    res.json({ 
      success: true, 
      message: "Volunteer request accepted successfully" 
    });
  } catch (error) {
    console.error("Accept volunteer error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},

// Decline volunteer request
declineVolunteer: async (req, res) => {
  try {
    const { id, volunteerId } = req.params;
    const { reason } = req.body;
    const adminId = req.session.admin.id;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: "Reason is required for declining volunteer request" });
    }

    await pool.query(
      `
      UPDATE volunteers 
      SET status = 'declined',
          admin_response = $1,
          responded_by = $2,
          responded_at = NOW(),
          admin_response_seen = false
      WHERE id = $3 AND event_id = $4
      `,
      [reason.trim(), adminId, volunteerId, id]
    );

    res.json({ 
      success: true, 
      message: "Volunteer request declined successfully" 
    });
  } catch (error) {
    console.error("Decline volunteer error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},

// Accept all pending volunteers
acceptAllVolunteers: async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.session.admin.id;

    const result = await pool.query(
      `
      UPDATE volunteers 
      SET status = 'accepted',
          responded_by = $1,
          responded_at = NOW(),
          assigned_at = NOW(),
          admin_response_seen = false
      WHERE event_id = $2 AND status = 'pending'
      RETURNING id
      `,
      [adminId, id]
    );

    res.json({ 
      success: true, 
      message: `Accepted ${result.rows.length} volunteer requests successfully`,
      count: result.rows.length
    });
  } catch (error) {
    console.error("Accept all volunteers error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},

// Decline all pending volunteers
declineAllVolunteers: async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.session.admin.id;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: "Reason is required for declining all volunteer requests" });
    }

    const result = await pool.query(
      `
      UPDATE volunteers 
      SET status = 'declined',
          admin_response = $1,
          responded_by = $2,
          responded_at = NOW(),
          admin_response_seen = false
      WHERE event_id = $3 AND status = 'pending'
      RETURNING id
      `,
      [reason.trim(), adminId, id]
    );

    res.json({ 
      success: true, 
      message: `Declined ${result.rows.length} volunteer requests successfully`,
      count: result.rows.length
    });
  } catch (error) {
    console.error("Decline all volunteers error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},
};

export default adminController;
