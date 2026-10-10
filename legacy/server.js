import express from 'express';
import bodyParser from 'body-parser';
import methodOverride from 'method-override';
import path from 'path';
import session from 'express-session';
import { fileURLToPath } from 'url';
import adminCheck from './middleware/adminCheck.js';
import securityCheck from './middleware/securityCheck.js';
import userRoutes from './routes/userRoutes.js';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Content Security Policy
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "img-src 'self' data: https:; " + // <- allow https images
    "font-src 'self' https://cdn.jsdelivr.net; " +
    "connect-src 'self' http://localhost:3000 https://cdn.jsdelivr.net"
  );
  next();
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

app.use(adminCheck);
app.use(securityCheck);
app.use('/user', userRoutes);

// Views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/', (await import('./routes/index.js')).default);
app.use('/user', (await import('./routes/userRoutes.js')).default);
app.use('/admin', (await import('./routes/adminRoutes.js')).default);
app.use('/security', (await import('./routes/securityRoutes.js')).default);

const PORT = process.env.PORT || 3000;

// Start server for local + mobile access
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);

  // Display your local IP for mobile access
  const networkInterfaces = os.networkInterfaces();
  for (const interfaceName in networkInterfaces) {
    for (const net of networkInterfaces[interfaceName]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`📱 Access from your phone: http://${net.address}:${PORT}`);
      }
    }
  }
});
