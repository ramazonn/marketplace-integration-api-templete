# Firebase Notification Service

This service provides a comprehensive notification system for the Ubay Admin API, supporting various types of notifications including direct user notifications and news broadcasts.

## Features

- **Direct User Notifications**: Send notifications to specific users by client ID
- **News Broadcasts**: Send notifications to all active users
- **Rich Notifications**: Support for images, data payloads, and custom click actions
- **Batch Processing**: Efficient handling of large numbers of recipients
- **Error Handling**: Comprehensive error handling and logging

## Setup

### Environment Variables

Make sure you have the following environment variables set:

```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email
```

### Firebase Admin SDK

The service automatically initializes Firebase Admin SDK when instantiated.

## Usage Examples

### 1. Basic Notification Service

```typescript
import { FirebaseNotification } from '../services/firebase-notification';

const notificationService = new FirebaseNotification();

// Send to single user
await notificationService.sendNotification(token, {
    title: 'Hello!',
    body: 'This is a test notification'
});

// Send to multiple users
await notificationService.sendMulticastNotification(tokens, {
    title: 'Hello!',
    body: 'This is a test notification'
});
```

### 2. News Broadcasts

```typescript
// Send news to all users
const result = await notificationService.sendNewsToAllUsers({
    title: 'Breaking News!',
    body: 'Important announcement for all users',
    data: { newsId: '123', category: 'announcement' },
    imageUrl: 'https://example.com/image.jpg'
});

console.log(`Sent to ${result.successCount}/${result.totalUsers} users`);
```

### 3. Template Service

```typescript
import { NotificationTemplateService } from '../services/firebase-notification';

const templateService = new NotificationTemplateService();

// Send news notification
await templateService.sendNewsNotification(
    'New Product Launch',
    'Check out our latest products!',
    { newsId: '789', deepLink: 'products/new' }
);

// Send order update
await templateService.sendOrderNotification(
    'client123',
    'Order Update',
    'Your order has been shipped!',
    { orderId: 'order456', status: 'shipped' }
);

// Send welcome message
await templateService.sendWelcomeNotification('client123', 'John Doe');
```

## API Endpoints

### Send Notification to Client
```
POST /notification/send
{
    "client": "clientId",
    "title": "Notification Title",
    "description": "Notification Body",
    "data": { "key": "value" }
}
```

### Send News to All Users
```
POST /notification/send-news
{
    "title": "News Title",
    "body": "News Body",
    "data": { "newsId": "123" },
    "imageUrl": "https://example.com/image.jpg"
}
```

## Notification Types

### 1. Simple Notifications
- Basic title and body
- No additional data
- Suitable for general announcements

### 2. Rich Notifications
- Include images
- Custom click actions
- Deep linking support

### 3. Data Notifications
- Include structured data payloads
- App can handle data for custom actions
- Useful for dynamic content

## Best Practices

### 1. Batch Processing
- Use `sendMulticastNotification` for multiple recipients
- Firebase limits: 500 tokens per batch
- Service automatically handles batching for large audiences

### 2. Error Handling
- Always check success/failure counts
- Handle failed tokens appropriately
- Log errors for debugging

### 3. Performance
- Avoid sending to all users unless necessary
- Use direct notifications for user-specific updates
- Monitor delivery rates and adjust strategies

## Monitoring and Analytics

The service provides comprehensive logging:

- Success/failure counts for each operation
- Token-level error details
- Batch processing statistics
- Performance metrics

## Troubleshooting

### Common Issues

1. **Invalid FCM Token**: Check if tokens are valid and not expired
2. **Firebase Limits**: Respect 500 token limit per batch
3. **Authentication**: Verify Firebase credentials are correct
4. **Network Issues**: Check internet connectivity and Firebase status

### Debug Mode

Enable detailed logging by setting environment variable:
```bash
DEBUG=firebase-notification
```

## Security Considerations

- Validate all input data
- Use authentication middleware for protected endpoints
- Limit notification frequency to prevent spam
- Sanitize user-generated content

## Future Enhancements

- Scheduled notifications
- A/B testing support
- Analytics dashboard
- User preference management
- Notification templates
- Multi-language support 