import pool from "../config/db.js";
import bcrypt from "bcrypt";
import fs from 'fs'; // Add this import

const userController = {
  // Show user signup form
  showSignup: (req, res) => {
    res.render("user/sign-up", {
      error: null,
      success: null,
      formData: {},
    });
  },

  // Handle user signup
  signup: async (req, res) => {
    try {
      const { first_name, last_name, identifier, password, confirmPassword } = req.body;

      // Validate input
      if (!first_name || !last_name || !identifier || !password || !confirmPassword) {
        return res.render("user/sign-up", {
          error: "All fields are required",
          success: null,
          formData: req.body,
        });
      }

      // Validate student ID format (9 digits)
      const studentIdRegex = /^\d{9}$/;
      if (!studentIdRegex.test(identifier)) {
        return res.render("user/sign-up", {
          error: "Student ID must be exactly 9 digits",
          success: null,
          formData: req.body,
        });
      }

      // Check if passwords match
      if (password !== confirmPassword) {
        return res.render("user/sign-up", {
          error: "Passwords do not match",
          success: null,
          formData: req.body,
        });
      }

      // Validate password strength
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/;
      if (!passwordRegex.test(password)) {
        return res.render("user/sign-up", {
          error: "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character",
          success: null,
          formData: req.body,
        });
      }

      // Check if user already exists
      const userExists = await pool.query(
        "SELECT * FROM users WHERE identifier = $1",
        [identifier]
      );

      if (userExists.rows.length > 0) {
        return res.render("user/sign-up", {
          error: "Student ID already registered",
          success: null,
          formData: req.body,
        });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Insert new user
      await pool.query(
        `INSERT INTO users (first_name, last_name, identifier, password, user_type) 
         VALUES ($1, $2, $3, $4, 'user') RETURNING id`,
        [first_name, last_name, identifier, hashedPassword]
      );

      // Redirect to login page with success message
      res.redirect("/user/login?signup=success");
    } catch (error) {
      console.error("User signup error:", error);

      // Check for specific database errors
      if (error.code === "23505") {
        return res.render("user/sign-up", {
          error: "Student ID already registered",
          success: null,
          formData: req.body,
        });
      }

      res.render("user/sign-up", {
        error: "Internal server error. Please try again.",
        success: null,
        formData: req.body,
      });
    }
  },

  // Show user login form
  showLogin: (req, res) => {
    const success = req.query.signup === "success" 
      ? "Account created successfully. Please login." 
      : null;
    const error = req.query.error || null;
    res.render("user/login", {
      error: error,
      success: success,
    });
  },

  // Handle user login
  login: async (req, res) => {
    try {
      const { identifier, password } = req.body;

      // Validate input
      if (!identifier || !password) {
        return res.render("user/login", {
          error: "All fields are required",
          success: null,
        });
      }

      // Find user
      const userResult = await pool.query(
        "SELECT * FROM users WHERE identifier = $1 AND user_type = 'user'",
        [identifier]
      );

      if (userResult.rows.length === 0) {
        return res.render("user/login", {
          error: "Invalid student ID or password",
          success: null,
        });
      }

      const user = userResult.rows[0];

      // Check if user is active
      if (user.status !== "active") {
        return res.render("user/login", {
          error: "Your account has been deactivated. Please contact administration.",
          success: null,
        });
      }

      // Compare passwords
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.render("user/login", {
          error: "Invalid student ID or password",
          success: null,
        });
      }

      // Set session
      req.session.user = {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        identifier: user.identifier,
        userType: user.user_type,
        wallet: user.wallet
      };

      // Redirect to user dashboard
      res.redirect("/user/dashboard");
    } catch (error) {
      console.error("User login error:", error);
      res.render("user/login", {
        error: "Internal server error",
        success: null,
      });
    }
  },

  // User dashboard
  dashboard: async (req, res) => {
    try {
      const userId = req.session.user.id;

      // Get user's wallet balance
      const walletResult = await pool.query(
        "SELECT wallet FROM users WHERE id = $1",
        [userId]
      );

      // Get upcoming events
      const upcomingEvents = await pool.query(
        `SELECT * FROM events 
         WHERE start_date_time > NOW() AND status = 'active'
         ORDER BY start_date_time ASC 
         LIMIT 5`
      );

      // Get user's recent tickets
      const recentTickets = await pool.query(
        `SELECT t.*, e.title as event_title, e.start_date_time, e.venue
         FROM tickets t
         JOIN events e ON t.event_id = e.id
         WHERE t.user_id = $1
         ORDER BY t.created_at DESC
         LIMIT 5`,
        [userId]
      );

      // Get events count
      const eventsCount = await pool.query(
        "SELECT COUNT(*) FROM events WHERE start_date_time > NOW() AND status = 'active'"
      );

      res.render("user/dashboard", {
        user: req.session.user,
        wallet: walletResult.rows[0].wallet,
        upcomingEvents: upcomingEvents.rows,
        recentTickets: recentTickets.rows,
        eventsCount: eventsCount.rows[0].count,
      });
    } catch (error) {
      console.error("User dashboard error:", error);
      res.render("user/dashboard", {
        user: req.session.user,
        wallet: 0,
        upcomingEvents: [],
        recentTickets: [],
        eventsCount: 0,
      });
    }
  },

  // User logout
  logout: (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
      }
      res.render("index");
    });
  },
  // Events list with tabs
events: async (req, res) => {
  try {
    const { tab, search } = req.query;
    const currentTab = tab || 'active';
    let events;
    let query;
    let queryParams = [];

    const baseQuery = `
      SELECT e.*, 
             COUNT(DISTINCT t.id) as attendees_count,
             COUNT(DISTINCT c.id) as comments_count,
             EXISTS(SELECT 1 FROM event_likes WHERE event_id = e.id AND user_id = $1) as user_liked
      FROM events e
      LEFT JOIN tickets t ON e.id = t.event_id
      LEFT JOIN comments c ON e.id = c.event_id AND c.is_deleted = false
    `;

    queryParams.push(req.session.user.id);

    if (currentTab === 'active') {
      // Upcoming events
      query = `${baseQuery} WHERE e.start_date_time > NOW() AND e.status = 'active'`;
    } else if (currentTab === 'inprogress') {
      // Events currently happening
      query = `${baseQuery} WHERE e.start_date_time <= NOW() AND e.end_date_time >= NOW() AND e.status = 'active'`;
    } else if (currentTab === 'past') {
      // Past events
      query = `${baseQuery} WHERE e.end_date_time < NOW() AND e.status = 'active'`;
    }// In the events function, add this condition:
 else if (currentTab === 'cancelled') {
  // Cancelled events
  query = `${baseQuery} WHERE e.status = 'cancelled'`;
}

    // Add search filter
    if (search) {
      query += ` AND e.title ILIKE $${queryParams.length + 1}`;
      queryParams.push(`%${search}%`);
    }

    query += ` GROUP BY e.id ORDER BY e.start_date_time ${currentTab === 'past' ? 'DESC' : 'ASC'}`;

    events = await pool.query(query, queryParams);

    // Get user's liked events for the like status
    const userLikes = await pool.query(
      'SELECT event_id FROM event_likes WHERE user_id = $1',
      [req.session.user.id]
    );

    const likedEventIds = userLikes.rows.map(like => like.event_id);

    // Add like status to events
    const eventsWithLikes = events.rows.map(event => ({
      ...event,
      user_liked: likedEventIds.includes(event.id)
    }));

    res.render("user/events", {
      events: eventsWithLikes,
      currentTab: currentTab,
      searchQuery: search || '',
      user: req.session.user
    });
  } catch (error) {
    console.error("Events error:", error);
    res.render("user/events", {
      events: [],
      currentTab: 'active',
      searchQuery: '',
      user: req.session.user
    });
  }
},

// Like/Unlike event
likeEvent: async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    // Check if user already liked the event
    const existingLike = await pool.query(
      'SELECT * FROM event_likes WHERE event_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingLike.rows.length > 0) {
      // Unlike the event
      await pool.query(
        'DELETE FROM event_likes WHERE event_id = $1 AND user_id = $2',
        [id, userId]
      );
      await pool.query(
        'UPDATE events SET likes_count = GREATEST(0, likes_count - 1) WHERE id = $1',
        [id]
      );
    } else {
      // Like the event
      await pool.query(
        'INSERT INTO event_likes (event_id, user_id) VALUES ($1, $2)',
        [id, userId]
      );
      await pool.query(
        'UPDATE events SET likes_count = likes_count + 1 WHERE id = $1',
        [id]
      );
    }

    // Get updated like count
    const eventResult = await pool.query(
      'SELECT likes_count FROM events WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      liked: existingLike.rows.length === 0, // true if now liked, false if now unliked
      likesCount: eventResult.rows[0].likes_count
    });
  } catch (error) {
    console.error("Like event error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},
// View event details
viewEvent: async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    // Get event details with like status and user ticket info
    const eventResult = await pool.query(`
      SELECT e.*, 
             EXISTS(SELECT 1 FROM event_likes WHERE event_id = e.id AND user_id = $1) as user_liked,
             EXISTS(SELECT 1 FROM tickets WHERE event_id = e.id AND user_id = $1) as user_has_ticket,
             EXISTS(SELECT 1 FROM volunteers WHERE event_id = e.id AND user_id = $1) as user_is_volunteer,
             COUNT(DISTINCT t.id) as attendees_count
      FROM events e
      LEFT JOIN tickets t ON e.id = t.event_id
      WHERE e.id = $2
      GROUP BY e.id
    `, [userId, id]);

    if (eventResult.rows.length === 0) {
      return res.status(404).render("error", { error: "Event not found" });
    }

    const event = eventResult.rows[0];

    // Get comments with user info and reactions
    const commentsResult = await pool.query(`
      SELECT 
        c.*,
        u.first_name,
        u.last_name,
        u.identifier,
        (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.reaction_type = 'like') as likes,
        (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.reaction_type = 'dislike') as dislikes,
        EXISTS(SELECT 1 FROM comment_reactions WHERE comment_id = c.id AND user_id = $1 AND reaction_type = 'like') as user_liked,
        EXISTS(SELECT 1 FROM comment_reactions WHERE comment_id = c.id AND user_id = $1 AND reaction_type = 'dislike') as user_disliked
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.event_id = $2 AND c.parent_comment IS NULL AND c.is_deleted = false
      ORDER BY c.created_at DESC
    `, [userId, id]);

    const comments = commentsResult.rows;

    // Get replies for each comment
    for (let comment of comments) {
      const repliesResult = await pool.query(`
        SELECT 
          c.*,
          u.first_name,
          u.last_name,
          u.identifier,
          (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.reaction_type = 'like') as likes,
          (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.reaction_type = 'dislike') as dislikes,
          EXISTS(SELECT 1 FROM comment_reactions WHERE comment_id = c.id AND user_id = $1 AND reaction_type = 'like') as user_liked,
          EXISTS(SELECT 1 FROM comment_reactions WHERE comment_id = c.id AND user_id = $1 AND reaction_type = 'dislike') as user_disliked
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.parent_comment = $2 AND c.is_deleted = false
        ORDER BY c.created_at ASC
      `, [userId, comment.id]);

      comment.replies = repliesResult.rows;
    }

    // Get user's wallet balance
    const walletResult = await pool.query(
      "SELECT wallet FROM users WHERE id = $1",
      [userId]
    );

    res.render("user/view_event", {
      event,
      comments,
      user: req.session.user,
      wallet: walletResult.rows[0].wallet,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error("View event error:", error);
    res.status(500).render("error", { error: "Internal server error" });
  }
},

// Buy ticket - FIXED VERSION
buyTicket: async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    // Get event details and user wallet
    const eventResult = await pool.query(
      "SELECT * FROM events WHERE id = $1",
      [id]
    );

    if (eventResult.rows.length === 0) {
      return res.redirect(`/user/event/${id}?error=Event not found`);
    }

    const event = eventResult.rows[0];
    const now = new Date();
    const eventEnd = new Date(event.end_date_time);

    // Check if event has ended
    if (now > eventEnd) {
      return res.redirect(`/user/event/${id}?error=This event has already ended`);
    }

    // Check if user already has a ticket
    const existingTicket = await pool.query(
      "SELECT * FROM tickets WHERE event_id = $1 AND user_id = $2",
      [id, userId]
    );

    if (existingTicket.rows.length > 0) {
      return res.redirect(`/user/event/${id}?error=You already have a ticket for this event`);
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get user's current wallet balance
      const walletResult = await client.query(
        "SELECT wallet FROM users WHERE id = $1 FOR UPDATE",
        [userId]
      );

      const userWallet = parseFloat(walletResult.rows[0].wallet);
      const entranceFee = parseFloat(event.entrance_fee);

      // Check if user has enough funds for paid events
      if (entranceFee > 0 && userWallet < entranceFee) {
        // Use return to ensure we exit the function
        return res.redirect(`/user/event/${id}?error=Insufficient funds in your wallet. You need $${entranceFee.toFixed(2)} but only have $${userWallet.toFixed(2)}`);
      }

      // Deduct amount from wallet for paid events
      if (entranceFee > 0) {
        const newBalance = userWallet - entranceFee;
        await client.query(
          "UPDATE users SET wallet = $1 WHERE id = $2",
          [newBalance, userId]
        );
      }

      // Create ticket reservation
      const ticketResult = await client.query(
        `INSERT INTO tickets (user_id, event_id, price_paid, status) 
         VALUES ($1, $2, $3, 'reserved') RETURNING *`,
        [userId, id, entranceFee]
      );

      await client.query('COMMIT');

      res.redirect(`/user/event/${id}?success=Ticket reserved successfully! The admin will generate your ticket soon.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Buy ticket error:", error);
    
    // More specific error handling
    let errorMessage = 'Internal server error';
    if (error.message.includes('Insufficient funds')) {
      errorMessage = 'Insufficient funds in your wallet';
    }
    
    res.redirect(`/user/event/${id}?error=${encodeURIComponent(errorMessage)}`);
  }
},

// Apply to volunteer
applyVolunteer: async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const { role, description } = req.body;

    // Check if event allows volunteers and is upcoming
    const eventResult = await pool.query(
      "SELECT * FROM events WHERE id = $1 AND volunteers_allowed = true AND start_date_time > NOW()",
      [id]
    );

    if (eventResult.rows.length === 0) {
      return res.redirect(`/user/event/${id}?error=Volunteer applications are not available for this event`);
    }

    // Check if user already applied
    const existingApplication = await pool.query(
      "SELECT * FROM volunteers WHERE event_id = $1 AND user_id = $2",
      [id, userId]
    );

    if (existingApplication.rows.length > 0) {
      return res.redirect(`/user/event/${id}?error=You have already applied to volunteer for this event`);
    }

    // Create volunteer application
    await pool.query(
      "INSERT INTO volunteers (user_id, event_id, role, description) VALUES ($1, $2, $3, $4)",
      [userId, id, role, description]
    );

    res.redirect(`/user/event/${id}?success=Volunteer application submitted successfully!`);
  } catch (error) {
    console.error("Apply volunteer error:", error);
    res.redirect(`/user/event/${id}?error=Internal server error`);
  }
},

// Comment functions (add, edit, delete, react, report)
addComment: async (req, res) => {
  try {
    const { event_id, comment, parent_comment } = req.body;
    const user_id = req.session.user.id;

    if (!event_id || !comment) {
      return res.status(400).json({ error: "Comment is required" });
    }

    const newComment = await pool.query(
      `INSERT INTO comments (user_id, event_id, comment, parent_comment) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [user_id, event_id, comment, parent_comment || null]
    );

    // Get comment with user info for response
    const commentWithUser = await pool.query(`
      SELECT c.*, u.first_name, u.last_name, u.identifier
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = $1
    `, [newComment.rows[0].id]);

    res.json({ success: true, comment: commentWithUser.rows[0] });
  } catch (error) {
    console.error("Add comment error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},

editComment: async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const user_id = req.session.user.id;

    // Check if comment exists and belongs to user
    const existingComment = await pool.query(
      "SELECT * FROM comments WHERE id = $1 AND user_id = $2 AND is_deleted = false",
      [id, user_id]
    );

    if (existingComment.rows.length === 0) {
      return res.status(404).json({ error: "Comment not found or you don't have permission to edit it" });
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

deleteComment: async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.session.user.id;

    // Soft delete - mark as deleted but keep in database
    await pool.query(
      "UPDATE comments SET is_deleted = true, deleted_at = NOW() WHERE id = $1 AND user_id = $2",
      [id, user_id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Delete comment error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},

addCommentReaction: async (req, res) => {
  try {
    const { id } = req.params;
    const { reaction_type } = req.body;
    const user_id = req.session.user.id;

    // Validate reaction type
    if (!['like', 'dislike'].includes(reaction_type)) {
      return res.status(400).json({ error: "Invalid reaction type" });
    }

    // Check if reaction already exists
    const existingReaction = await pool.query(
      "SELECT * FROM comment_reactions WHERE user_id = $1 AND comment_id = $2",
      [user_id, id]
    );

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      if (existingReaction.rows.length > 0) {
        const existingType = existingReaction.rows[0].reaction_type;
        
        if (existingType === reaction_type) {
          // Remove reaction if same type clicked again
          await client.query(
            "DELETE FROM comment_reactions WHERE user_id = $1 AND comment_id = $2",
            [user_id, id]
          );
        } else {
          // Update reaction type
          await client.query(
            "UPDATE comment_reactions SET reaction_type = $1 WHERE user_id = $2 AND comment_id = $3",
            [reaction_type, user_id, id]
          );
        }
      } else {
        // Add new reaction
        await client.query(
          "INSERT INTO comment_reactions (user_id, comment_id, reaction_type) VALUES ($1, $2, $3)",
          [user_id, id, reaction_type]
        );
      }

      // Get updated counts
      const likesResult = await client.query(
        "SELECT COUNT(*) as count FROM comment_reactions WHERE comment_id = $1 AND reaction_type = 'like'",
        [id]
      );

      const dislikesResult = await client.query(
        "SELECT COUNT(*) as count FROM comment_reactions WHERE comment_id = $1 AND reaction_type = 'dislike'",
        [id]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        likes: parseInt(likesResult.rows[0].count),
        dislikes: parseInt(dislikesResult.rows[0].count)
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Add comment reaction error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},

reportComment: async (req, res) => {
  try {
    const { id } = req.params;
    const { report_reason, report_type } = req.body;
    const user_id = req.session.user.id;

    if (!report_reason) {
      return res.status(400).json({ error: "Report reason is required" });
    }

    // Get comment details
    const commentResult = await pool.query(
      "SELECT user_id as reported_user_id, event_id FROM comments WHERE id = $1",
      [id]
    );

    if (commentResult.rows.length === 0) {
      return res.status(404).json({ error: "Comment not found" });
    }

    const { reported_user_id, event_id } = commentResult.rows[0];

    // Create report
    await pool.query(
      `INSERT INTO reports (reporter_id, reported_user_id, comment_id, report_reason, report_type) 
       VALUES ($1, $2, $3, $4, $5)`,
      [user_id, reported_user_id, id, report_reason, report_type || 'inappropriate']
    );

    res.json({ success: true, message: "Comment reported successfully" });
  } catch (error) {
    console.error("Report comment error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},
// Photo Wall
photoWall: async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    // Get event details
    const eventResult = await pool.query(
      "SELECT * FROM events WHERE id = $1",
      [id]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).render("error", { error: "Event not found" });
    }

    const event = eventResult.rows[0];

    // Check if event has ended
    const now = new Date();
    const eventEnd = new Date(event.end_date_time);
    if (now < eventEnd) {
      return res.redirect(`/user/event/${id}?error=Photo wall is only available after the event has ended`);
    }

    // Get user's photo upload count for this event
    const userPhotosCount = await pool.query(
      "SELECT COUNT(*) FROM photo_wall WHERE event_id = $1 AND user_id = $2 AND is_deleted = false",
      [id, userId]
    );

    // Get all photos for this event with user info and like status
    const photosResult = await pool.query(`
      SELECT 
        pw.*,
        u.first_name,
        u.last_name,
        u.identifier,
        EXISTS(SELECT 1 FROM photo_wall_likes WHERE photo_wall_id = pw.id AND user_id = $1) as user_hearted,
        COUNT(pwl.id) as hearts_count
      FROM photo_wall pw
      JOIN users u ON pw.user_id = u.id
      LEFT JOIN photo_wall_likes pwl ON pw.id = pwl.photo_wall_id
      WHERE pw.event_id = $2 AND pw.is_deleted = false
      GROUP BY pw.id, u.first_name, u.last_name, u.identifier
      ORDER BY pw.created_at DESC
    `, [userId, id]);

    res.render("user/photo_wall", {
      event,
      photos: photosResult.rows,
      userPhotosCount: parseInt(userPhotosCount.rows[0].count),
      user: req.session.user,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error("Photo wall error:", error);
    res.status(500).render("error", { error: "Internal server error" });
  }
},

// Upload photo to wall
uploadPhoto: async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const { caption } = req.body;

    if (!req.file) {
      return res.redirect(`/user/event/${id}/photos?error=Please select a photo to upload`);
    }

    // Get event details
    const eventResult = await pool.query(
      "SELECT * FROM events WHERE id = $1",
      [id]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).render("error", { error: "Event not found" });
    }

    const event = eventResult.rows[0];

    // Check if event has ended
    const now = new Date();
    const eventEnd = new Date(event.end_date_time);
    if (now < eventEnd) {
      return res.redirect(`/user/event/${id}/photos?error=Cannot upload photos before event ends`);
    }

    // Check user's upload limit (max 3 photos)
    const userPhotosCount = await pool.query(
      "SELECT COUNT(*) FROM photo_wall WHERE event_id = $1 AND user_id = $2 AND is_deleted = false",
      [id, userId]
    );

    if (parseInt(userPhotosCount.rows[0].count) >= 3) {
      return res.redirect(`/user/event/${id}/photos?error=You have reached the maximum upload limit of 3 photos`);
    }

    // Handle file upload
    const imageUrl = `/uploads/photo_wall/${req.file.filename}`;

    // Insert photo into database
    await pool.query(
      "INSERT INTO photo_wall (user_id, event_id, image_url, caption) VALUES ($1, $2, $3, $4)",
      [userId, id, imageUrl, caption || null]
    );

    res.redirect(`/user/event/${id}/photos?success=Photo uploaded successfully!`);
  } catch (error) {
    console.error("Upload photo error:", error);
    res.redirect(`/user/event/${id}/photos?error=Internal server error`);
  }
},

// Heart/Unheart photo
heartPhoto: async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    // Check if user already hearted the photo
    const existingHeart = await pool.query(
      'SELECT * FROM photo_wall_likes WHERE photo_wall_id = $1 AND user_id = $2',
      [id, userId]
    );

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      if (existingHeart.rows.length > 0) {
        // Unheart the photo
        await client.query(
          'DELETE FROM photo_wall_likes WHERE photo_wall_id = $1 AND user_id = $2',
          [id, userId]
        );
        await client.query(
          'UPDATE photo_wall SET hearts_count = GREATEST(0, hearts_count - 1) WHERE id = $1',
          [id]
        );
      } else {
        // Heart the photo
        await client.query(
          'INSERT INTO photo_wall_likes (photo_wall_id, user_id) VALUES ($1, $2)',
          [id, userId]
        );
        await client.query(
          'UPDATE photo_wall SET hearts_count = hearts_count + 1 WHERE id = $1',
          [id]
        );
      }

      // Get updated heart count
      const photoResult = await client.query(
        'SELECT hearts_count FROM photo_wall WHERE id = $1',
        [id]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        hearted: existingHeart.rows.length === 0, // true if now hearted, false if now unhearted
        heartsCount: photoResult.rows[0].hearts_count
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Heart photo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},

// Edit photo caption
editPhotoCaption: async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const { caption } = req.body;

    // Check if photo exists and belongs to user
    const photoResult = await pool.query(
      "SELECT * FROM photo_wall WHERE id = $1 AND user_id = $2 AND is_deleted = false",
      [id, userId]
    );

    if (photoResult.rows.length === 0) {
      return res.status(404).json({ error: "Photo not found or you don't have permission to edit it" });
    }

    // Update caption
    await pool.query(
      "UPDATE photo_wall SET caption = $1, updated_at = NOW() WHERE id = $2",
      [caption, id]
    );

    res.json({ success: true, message: "Caption updated successfully" });
  } catch (error) {
    console.error("Edit photo caption error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},

// Delete photo (soft delete)
deletePhoto: async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    // Check if photo exists and belongs to user
    const photoResult = await pool.query(
      "SELECT * FROM photo_wall WHERE id = $1 AND user_id = $2 AND is_deleted = false",
      [id, userId]
    );

    if (photoResult.rows.length === 0) {
      return res.status(404).json({ error: "Photo not found or you don't have permission to delete it" });
    }

    // Soft delete the photo
    await pool.query(
      "UPDATE photo_wall SET is_deleted = true, deleted_at = NOW(), deleted_by = $1 WHERE id = $2",
      [userId, id]
    );

    res.json({ success: true, message: "Photo deleted successfully" });
  } catch (error) {
    console.error("Delete photo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},

// Report photo
reportPhoto: async (req, res) => {
  try {
    const { id } = req.params;
    const { report_reason, report_type } = req.body;
    const user_id = req.session.user.id;

    if (!report_reason) {
      return res.status(400).json({ error: "Report reason is required" });
    }

    // Get photo details
    const photoResult = await pool.query(
      "SELECT user_id as reported_user_id, event_id FROM photo_wall WHERE id = $1",
      [id]
    );

    if (photoResult.rows.length === 0) {
      return res.status(404).json({ error: "Photo not found" });
    }

    const { reported_user_id, event_id } = photoResult.rows[0];

    // Create report for photo wall
    await pool.query(
      `INSERT INTO reports (reporter_id, reported_user_id, photo_wall_id, report_reason, report_type, report_category) 
       VALUES ($1, $2, $3, $4, $5, 'photo_wall')`,
      [user_id, reported_user_id, id, report_reason, report_type || 'inappropriate']
    );

    res.json({ success: true, message: "Photo reported successfully" });
  } catch (error) {
    console.error("Report photo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},
// User Tickets List
tickets: async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { status } = req.query;

    let query = `
      SELECT 
        t.*,
        e.title as event_title,
        e.start_date_time,
        e.end_date_time,
        e.venue,
        e.cover_image,
        e.entrance_fee
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      WHERE t.user_id = $1
    `;
    
    let queryParams = [userId];
    
    // Add status filter if provided
    if (status && status !== 'all') {
      query += ` AND t.status = $${queryParams.length + 1}`;
      queryParams.push(status);
    }
    
    query += ` ORDER BY t.created_at DESC`;

    const ticketsResult = await pool.query(query, queryParams);

    // Get ticket statistics
    const statsResult = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM tickets 
      WHERE user_id = $1
      GROUP BY status
    `, [userId]);

    const stats = {
      reserved: 0,
      sent: 0,
      scanned: 0,
      total: 0
    };

    statsResult.rows.forEach((stat) => {
      stats[stat.status] = parseInt(stat.count);
    });
    stats.total = ticketsResult.rows.length;

    res.render("user/tickets", {
      tickets: ticketsResult.rows,
      stats: stats,
      statusFilter: status || 'all',
      user: req.session.user,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error("Tickets error:", error);
    res.render("user/tickets", {
      tickets: [],
      stats: { reserved: 0, sent: 0, scanned: 0, total: 0 },
      statusFilter: 'all',
      user: req.session.user,
      error: "Internal server error. Please try again.",
      success: null
    });
  }
},

// View Single Ticket
viewTicket: async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    // Get ticket details with event and user information
    const ticketResult = await pool.query(`
      SELECT 
        t.*,
        e.title as event_title,
        e.start_date_time,
        e.end_date_time,
        e.venue,
        e.cover_image,
        e.entrance_fee,
        e.description as event_description,
        u.first_name,
        u.last_name,
        u.identifier
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      JOIN users u ON t.user_id = u.id
      WHERE t.id = $1 AND t.user_id = $2
    `, [id, userId]);

    if (ticketResult.rows.length === 0) {
      return res.status(404).render("error", { 
        error: "Ticket not found or you don't have permission to view it" 
      });
    }

    const ticket = ticketResult.rows[0];

    res.render("user/view_ticket", {
      ticket: ticket,
      user: req.session.user,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error("View ticket error:", error);
    res.status(500).render("error", { error: "Internal server error" });
  }
},
// Update the wallet function to fetch real transactions
wallet: async (req, res) => {
  try {
    const userId = req.session.user.id;

    // Get user's current wallet balance - KEEP EXISTING
    const walletResult = await pool.query(
      "SELECT wallet FROM users WHERE id = $1",
      [userId]
    );

    // ✅ ADD THIS: Get real transactions from database (REPLACES DUMMY DATA)
    const transactionsResult = await pool.query(`
      SELECT 
        id,
        type,
        amount,
        description,
        status,
        created_at,
        reference
      FROM transactions 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 10
    `, [userId]);

    // KEEP EXISTING RENDER BUT WITH REAL TRANSACTIONS
    res.render("user/wallet", {
      user: req.session.user,
      wallet: walletResult.rows[0].wallet,
      transactions: transactionsResult.rows, // Now real data instead of dummy
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error("Wallet error:", error);
    res.render("user/wallet", {
      user: req.session.user,
      wallet: 0,
      transactions: [], // Empty array on error
      error: "Internal server error. Please try again.",
      success: null
    });
  }
},

// Process deposit - ENHANCED VERSION (keeps all existing functionality + adds transactions)
processDeposit: async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { amount, cardNumber, expiryDate, cvv, cardHolder } = req.body;

    // Validate input (KEEP ALL YOUR EXISTING VALIDATION)
    if (!amount || parseFloat(amount) <= 0) {
      return res.redirect('/user/wallet?error=Please enter a valid amount');
    }

    const depositAmount = parseFloat(amount);

    // Validate card details (basic simulation) - KEEP EXISTING
    if (!cardNumber || cardNumber.replace(/\s/g, '').length !== 16) {
      return res.redirect('/user/wallet?error=Please enter a valid card number');
    }

    if (!expiryDate || !expiryDate.match(/^(0[1-9]|1[0-2])\/([0-9]{2})$/)) {
      return res.redirect('/user/wallet?error=Please enter a valid expiry date (MM/YY)');
    }

    if (!cvv || cvv.length !== 3) {
      return res.redirect('/user/wallet?error=Please enter a valid CVV');
    }

    if (!cardHolder) {
      return res.redirect('/user/wallet?error=Please enter card holder name');
    }

    // Simulate payment processing delay - KEEP EXISTING
    await new Promise(resolve => setTimeout(resolve, 2000));

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current wallet balance - KEEP EXISTING
      const walletResult = await client.query(
        "SELECT wallet FROM users WHERE id = $1 FOR UPDATE",
        [userId]
      );

      if (walletResult.rows.length === 0) {
        throw new Error("User not found");
      }

      const currentBalance = parseFloat(walletResult.rows[0].wallet);
      const newBalance = currentBalance + depositAmount;

      // Update user's wallet - KEEP EXISTING
      await client.query(
        "UPDATE users SET wallet = $1 WHERE id = $2",
        [newBalance, userId]
      );

      // ✅ ADD THIS: Create transaction record (NEW FEATURE)
      const reference = 'DEP' + Date.now();
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, description, status, reference) 
         VALUES ($1, 'deposit', $2, 'Card Deposit', 'completed', $3)`,
        [userId, depositAmount, reference]
      );

      await client.query('COMMIT');

      // KEEP EXISTING SUCCESS REDIRECT
      res.redirect(`/user/wallet?success=Deposit of R${depositAmount.toFixed(2)} completed successfully!`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Process deposit error:", error);
    res.redirect('/user/wallet?error=Internal server error. Please try again.');
  }
},

// Process withdrawal - ENHANCED VERSION (keeps all existing functionality + adds transactions)
processWithdrawal: async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { amount, bankAccount, bankName } = req.body;

    // Validate input - KEEP ALL EXISTING VALIDATION
    if (!amount || parseFloat(amount) <= 0) {
      return res.redirect('/user/wallet?error=Please enter a valid amount');
    }

    const withdrawalAmount = parseFloat(amount);

    if (!bankAccount) {
      return res.redirect('/user/wallet?error=Please enter bank account number');
    }

    if (!bankName) {
      return res.redirect('/user/wallet?error=Please enter bank name');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current wallet balance - KEEP EXISTING
      const walletResult = await client.query(
        "SELECT wallet FROM users WHERE id = $1 FOR UPDATE",
        [userId]
      );

      if (walletResult.rows.length === 0) {
        throw new Error("User not found");
      }

      const currentBalance = parseFloat(walletResult.rows[0].wallet);

      // Check if user has sufficient funds - KEEP EXISTING
      if (currentBalance < withdrawalAmount) {
        throw new Error("Insufficient funds");
      }

      const newBalance = currentBalance - withdrawalAmount;

      // Update user's wallet - KEEP EXISTING
      await client.query(
        "UPDATE users SET wallet = $1 WHERE id = $2",
        [newBalance, userId]
      );

      // ✅ ADD THIS: Create transaction record (NEW FEATURE)
      const reference = 'WD' + Date.now();
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, description, status, reference) 
         VALUES ($1, 'withdrawal', $2, 'Bank Transfer to ' || $3, 'completed', $4)`,
        [userId, withdrawalAmount, bankName, reference]
      );

      await client.query('COMMIT');

      // Simulate bank transfer processing delay - KEEP EXISTING
      await new Promise(resolve => setTimeout(resolve, 1500));

      // KEEP EXISTING SUCCESS MESSAGE
      res.redirect(`/user/wallet?success=Withdrawal of R${withdrawalAmount.toFixed(2)} has been processed! Funds will be transferred to your bank account within 2-3 business days.`);
    } catch (error) {
      await client.query('ROLLBACK');
      
      if (error.message === "Insufficient funds") {
        return res.redirect('/user/wallet?error=Insufficient funds in your wallet');
      }
      
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Process withdrawal error:", error);
    res.redirect('/user/wallet?error=Internal server error. Please try again.');
  }
},
// User Notifications - UPDATED VERSION
notifications: async (req, res) => {
  try {
    const userId = req.session.user.id;

    // Get reports where user is the reporter and admin has responded
    const reportsResult = await pool.query(`
      SELECT 
        r.*,
        reported.first_name as reported_first_name,
        reported.last_name as reported_last_name,
        e.title as event_title,
        e.id as event_id,
        CASE 
          WHEN r.photo_wall_id IS NOT NULL THEN 'photo'
          ELSE 'comment'
        END as content_type
      FROM reports r
      JOIN users reported ON r.reported_user_id = reported.id
      LEFT JOIN comments c ON r.comment_id = c.id
      LEFT JOIN events e ON c.event_id = e.id OR r.photo_wall_id IN (
        SELECT event_id FROM photo_wall WHERE id = r.photo_wall_id
      )
      WHERE r.reporter_id = $1 
        AND r.admin_response IS NOT NULL
        AND r.status IN ('resolved', 'dismissed')
    `, [userId]);

    // ✅ ADD THIS: Get volunteer application status updates
    const volunteerUpdatesResult = await pool.query(`
      SELECT 
        v.*,
        e.title as event_title,
        e.start_date_time,
        e.end_date_time,
        e.venue,
        admin.first_name as admin_first_name,
        admin.last_name as admin_last_name,
        'volunteer' as notification_type
      FROM volunteers v
      JOIN events e ON v.event_id = e.id
      LEFT JOIN users admin ON v.responded_by = admin.id
      WHERE v.user_id = $1 
        AND v.status IN ('accepted', 'rejected')
        AND (v.admin_response_seen = false OR v.admin_response_seen IS NULL)
    `, [userId]);

    // Combine both types of notifications
    const allNotifications = [];

    // Add report notifications
    reportsResult.rows.forEach(report => {
      allNotifications.push({
        ...report,
        notification_type: 'report',
        created_at: report.resolved_at || report.created_at,
        is_read: report.viewed || false
      });
    });

    // Add volunteer notifications
    volunteerUpdatesResult.rows.forEach(volunteer => {
      allNotifications.push({
        ...volunteer,
        notification_type: 'volunteer',
        created_at: volunteer.responded_at || volunteer.updated_at,
        is_read: volunteer.admin_response_seen || false,
        // For consistent display with reports
        status: volunteer.status === 'accepted' ? 'resolved' : 'dismissed',
        admin_response: volunteer.admin_response || 
          (volunteer.status === 'accepted' 
            ? `Your volunteer application for "${volunteer.role}" has been accepted!` 
            : `Your volunteer application for "${volunteer.role}" has been rejected.`)
      });
    });

    // Sort all notifications by date (newest first)
    allNotifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Get unread count for the badge
    const unreadCount = allNotifications.filter(notification => !notification.is_read).length;

    res.render("user/notifications", {
      user: req.session.user,
      notifications: allNotifications,
      unreadCount: unreadCount,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error("Notifications error:", error);
    res.render("user/notifications", {
      user: req.session.user,
      notifications: [],
      unreadCount: 0,
      error: "Internal server error. Please try again.",
      success: null
    });
  }
},

// Mark notification as read - UPDATED VERSION
markNotificationRead: async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const { type } = req.body; // 'report' or 'volunteer'

    if (type === 'volunteer') {
      // Mark volunteer notification as seen
      const result = await pool.query(`
        UPDATE volunteers 
        SET admin_response_seen = true 
        WHERE id = $1 
          AND user_id = $2 
          AND status IN ('accepted', 'rejected')
        RETURNING id
      `, [id, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Volunteer notification not found" });
      }
    } else {
      // Mark report notification as viewed (existing functionality)
      const result = await pool.query(`
        UPDATE reports 
        SET viewed = true 
        WHERE id = $1 
          AND reporter_id = $2 
          AND admin_response IS NOT NULL
        RETURNING id
      `, [id, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Report notification not found" });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Mark notification read error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},

// Mark all notifications as read - UPDATED VERSION
markAllNotificationsRead: async (req, res) => {
  try {
    const userId = req.session.user.id;

    // Mark all report notifications as read
    await pool.query(`
      UPDATE reports 
      SET viewed = true 
      WHERE reporter_id = $1 
        AND admin_response IS NOT NULL 
        AND viewed = false
    `, [userId]);

    // ✅ ADD THIS: Mark all volunteer notifications as seen
    await pool.query(`
      UPDATE volunteers 
      SET admin_response_seen = true 
      WHERE user_id = $1 
        AND status IN ('accepted', 'rejected')
        AND (admin_response_seen = false OR admin_response_seen IS NULL)
    `, [userId]);

    res.json({ success: true });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
},
};

export default userController;