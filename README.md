# Smart Digital Tole

A comprehensive community management platform designed to streamline administrative tasks, resident engagement, and IoT-based monitoring for residential societies and communities.

## Overview

Smart Digital Tole is a full-stack web application that combines a React-based frontend with an Express.js backend to provide a complete solution for managing community operations. The platform includes features for resident management, complaint tracking, garbage management, notice distribution, and IoT sensor monitoring.

## Key Features

- **User Management**
  - Admin authentication and authorization
  - Resident registration and login
  - Role-based access control

- **Complaint Management**
  - Submit and track complaints
  - Photo attachments support
  - Real-time status updates
  - Category-based organization

- **Garbage Management**
  - Track garbage collection status
  - IoT dustbin monitoring via ESP32
  - Assignment and scheduling

- **Notifications & Notices**
  - Email notifications system
  - Community notices distribution
  - Real-time notification center

- **Committee Management**
  - Committee member tracking
  - Role assignments
  - Emergency contacts

- **Dashboard & Analytics**
  - Admin dashboard with overview
  - Resident personal dashboard
  - Community statistics and insights

## Tech Stack

### Frontend
- **Framework**: React 18.3.1
- **Build Tool**: Vite 6.1.0
- **Routing**: React Router DOM 6.30.1
- **HTTP Client**: Axios 1.7.9
- **Styling**: CSS

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js 4.21.2
- **Database**: MySQL 3.12.0
- **Authentication**: bcryptjs 2.4.3
- **Email**: Nodemailer 6.10.1
- **CORS**: Enabled for frontend integration

### IoT
- **Microcontroller**: ESP32
- **Application**: Dustbin monitoring and sensor data collection

## Project Structure

```
smart-tole-run-package/
├── client/                  # React frontend
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
├── server/                  # Express backend
│   ├── src/
│   ├── sql/                 # Database schemas
│   ├── package.json
│   └── .env.example
└── iot/                     # IoT configurations
    ├── esp32_dustbin_monitor/
    └── IOT_SETUP.md
```

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- MySQL Server (v5.7 or higher)
- Git

### Installation

#### 1. Clone the Repository
```bash
git clone <repository-url>
cd smart-tole-run-package
```

#### 2. Backend Setup
```bash
cd server

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Configure your database and email credentials in .env
# DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
# SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS

# Run database setup (if needed)
# Execute SQL files in sql/ folder to bootstrap the database

# Start the development server
npm run dev

# Or start the production server
npm start
```

#### 3. Frontend Setup
```bash
cd client

# Install dependencies
npm install

# Start the development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

#### 4. IoT Setup (Optional)
```bash
cd iot

# Refer to IOT_SETUP.md for ESP32 configuration
# and dustbin monitor setup instructions
```

### Configuration

Create a `.env` file in the `server/` directory with the following variables:

```env
# Database Configuration
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=tole_management

# Server Configuration
PORT=5000

# Email Configuration (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM_EMAIL=your_email@gmail.com
SMTP_FROM_NAME=Smart Digital Tole

# Support Contact
ADMIN_SUPPORT_EMAIL=support@example.com
```

## Database Setup

The project includes SQL migration files in `server/sql/`:

1. `bootstrap-full-schema.sql` - Complete database schema
2. Additional migration files for specific features

Execute these files in MySQL Workbench or via command line:

```bash
mysql -u root -p tole_management < server/sql/bootstrap-full-schema.sql
```

## API Endpoints

The backend provides RESTful APIs for:

- **Authentication**: `/api/auth` - Login, register, password reset
- **Admin**: `/api/admin` - Admin operations
- **Residents**: `/api/residents` - Resident management
- **Complaints**: `/api/complaints` - Complaint tracking
- **Garbage**: `/api/garbage` - Garbage collection management
- **Notices**: `/api/notices` - Notice distribution
- **Notifications**: `/api/notifications` - Notification management
- **Profile**: `/api/profile` - User profile management

## Development

### Available Commands

**Frontend:**
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

**Backend:**
```bash
npm run dev      # Start with auto-reload (using --watch)
npm start        # Start production server
```

## Database Migrations

The project includes SQL scripts for various database operations:

- `add-complaint-photo.sql` - Add photo support to complaints
- `add-garbage-assignment.sql` - Add garbage assignment tracking
- `add-notice-photo.sql` - Add photo support to notices
- `add-user-address-fields.sql` - Extend user address fields
- `create-complaint-updates.sql` - Add complaint update tracking
- `create-email-notification-log.sql` - Email notification logging
- `expand-complaint-categories.sql` - Expand complaint categories
- `final-year-scope-upgrade.sql` - Final year enhancements
- `xampp-auth-setup.sql` - XAMPP-specific authentication setup

## Security Features

- Password hashing with bcryptjs
- CORS enabled for secure cross-origin requests
- Email verification support
- Role-based access control (RBAC)
- Environment variable protection for sensitive data

## Email Notifications

The platform uses Gmail SMTP for sending email notifications:

- User registration confirmation
- Password reset links
- Complaint status updates
- Notice distribution
- Emergency alerts

## Troubleshooting

### Database Connection Issues
- Verify MySQL is running
- Check DB credentials in `.env`
- Ensure database exists: `CREATE DATABASE tole_management;`

### Email Sending Issues
- Use Gmail App Password (not regular password)
- Enable "Less Secure App Access" if not using App Password
- Check SMTP settings in `.env`

### Port Already in Use
- Change `PORT` in `.env` (default: 5000)
- Or kill the process: `lsof -ti:5000 | xargs kill -9` (Linux/Mac)

## License

This project is developed for Smart Digital Tole community management.

## Contributing

For contributions, please follow the existing code structure and create feature branches for new features.



