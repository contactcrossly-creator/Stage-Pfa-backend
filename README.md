# Stage-PFA Backend

This repository contains the Express.js backend for the SCE-SICMS industrial application.
It uses Firebase Firestore as a service layer and Firebase Admin for Cloud Messaging, while maintaining the backend as the single source of truth.

## Features

- JWT authentication for all protected routes
- Firebase Admin integration for:
  - Firestore data storage
  - Firebase Cloud Messaging (FCM)
- Notification module with admin-triggered push notifications
- Realtime chat collections for groups and messages
- Centralized validation and error handling

## Setup

1. Install dependencies:

```bash
npm install
```

2. Required environment variables:

- `JWT_SECRET`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

3. Start server:

```bash
npm run dev
```

## Firebase Admin configuration

The Firebase Admin SDK is initialized in `src/config/firebaseAdmin.js` and re-exported from `src/config/firebase.config.js`.

- `admin` for admin utilities
- `firestore` for Firestore access
- `messaging` for FCM delivery

## FCM / Push notification flow

### Save FCM token

Endpoint:

`POST /api/users/fcm-token`

Body:

```json
{
  "fcmToken": "device_token_here"
}
```

This saves the authenticated user's device token in Firestore.

### Send push notification (admin)

Endpoint:

`POST /api/notifications/send`

Body:

```json
{
  "userIds": ["user1", "user2"],
  "title": "Alert",
  "body": "Incident critical",
  "data": {
    "incidentId": "abc123"
  }
}
```

This endpoint sends FCM messages to specified users and records notification entries.

## Chat / Firestore flow

### Create group

`POST /api/groups`

Body:

```json
{
  "name": "Production Team",
  "members": ["user1", "user2"]
}
```

### Get user groups

`GET /api/groups?page=1&limit=10`

Returns groups where the authenticated user is a member.

### Send message

`POST /api/messages`

Body:

```json
{
  "groupId": "group789",
  "content": "Hello team"
}
```

This saves a message to Firestore and updates the group's `lastMessage` and `lastMessageAt` metadata.

### Get messages

`GET /api/messages?groupId=group789&page=1&limit=50`

Returns paginated messages ordered by `createdAt` descending.

## Important rules

- Firebase is used only as a service, not as the main backend
- No Firebase Auth is used
- All access to Firebase is through the Express API
- Inputs are validated server-side
- Centralized error handling is used for API responses

## Notes

- Group documents store metadata for future-ready features such as `unreadCount`, `lastMessage`, and `typingIndicator`
- Notification service supports both targeted and role-based delivery
- Use `Authorization: Bearer <JWT>` for all protected endpoints
