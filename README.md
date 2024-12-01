# Friend-Chat Backend

The backend for Friend-Chat is built with Node.js, Express, and MongoDB. It provides the necessary APIs and WebSocket connections for real-time communication in the Friend-Chat application.

## Features

- RESTful API for user authentication and messaging
- WebSocket support for real-time messaging using Socket.IO
- MongoDB integration for data storage
- User management with profile picture updates
- Group chat functionality
- Message logging and read receipts
- Automatic management of database deletion to save space
- User status: Users can set their online/offline status.
- Clean up when approaching 400MB
- Monitor database size
- Check size every hour

## Futere update
- **Message editing**: Users can edit their messages after sending.
- **Typing indicators**: Users can see when others are typing.
- **Search functionality**: Users can search through their chat history.

## Technologies Used

- **Node.js**: JavaScript runtime for server-side development
- **Express**: Web framework for building APIs
- **Socket.IO**: Library for real-time web applications
- **MongoDB**: NoSQL database for data storage
- **Mongoose**: ODM (Object Data Modeling) library for MongoDB and Node.js
- **dotenv**: Module to load environment variables from a `.env` file

## Getting Started

### Prerequisites

- Node.js (version 18 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd backend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the root of the backend directory and add the following:

   ```env
   MONGODB_URI=<your-mongodb-uri>
   PORT=5000
   CHAT_PASSWORD=<your-chat-password>
   ```

   Replace `<your-mongodb-uri>` with your MongoDB connection string and `<your-chat-password>` with a secure password for chat operations.

### Running the Application

To start the server, run:

```bash
npm start
```

This will start the server on the specified port (default is 5000).

### API Endpoints

- **POST /api/auth/login**: Authenticate a user and return a token.
- **GET /api/users**: Retrieve a list of users.
- **GET /api/messages/:chatId**: Retrieve messages for a specific chat.
- **POST /api/messages**: Send a new message.

### WebSocket Events

- **connection**: Triggered when a user connects.
- **auth**: Authenticate a user via WebSocket.
- **send-message**: Send a message to a user or group.
- **delete-message**: Delete a specific message.

### Automatic Database Management

To manage database size and save space, the backend includes a scheduled task that checks the size of the MongoDB database. If the database size exceeds a specified limit (e.g., 350MB), the oldest messages are automatically deleted to maintain optimal performance. This process runs every hour and helps ensure that the database does not grow excessively large.

## Future Updates

- Implement user roles and permissions.
- Enhance security with JWT (JSON Web Tokens) for authentication.
- Add support for file uploads and sharing.
- Improve error handling and logging mechanisms.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License. 
