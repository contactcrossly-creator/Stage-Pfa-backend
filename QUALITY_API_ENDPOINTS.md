# Quality Module API Endpoints

This document provides comprehensive examples for all Quality module endpoints including request and response formats.

---

## Base URL
```
http://localhost:5000/api/quality
```

## Authentication
All endpoints require authentication via JWT token in the `Authorization` header.

---

## Endpoints Overview

| Method | Endpoint | Description | Required Role |
|--------|----------|-------------|---------------|
| POST | `/` | Create a new quality test | ADMIN, QUALITY |
| GET | `/` | Get all quality tests (with pagination) | Any authenticated user |
| GET | `/:id` | Get a specific quality test | Any authenticated user |
| PATCH | `/:id` | Update a quality test status | ADMIN, QUALITY |

---

## 1. CREATE QUALITY TEST

### Endpoint
```
POST /api/quality
```

### Description
Creates a new quality test for a completed production batch. The quality test starts with a `PENDING` status.

### Authentication
- Required: Yes
- Role: ADMIN, QUALITY

### Request Headers
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Request Body
```json
{
  "batchId": "batch_001_20250507",
  "notes": "Initial inspection started"
}
```

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| batchId | string | Yes | ID of the production batch to test. Batch must have COMPLETED status |
| notes | string | No | Additional notes about the test (max 1000 characters) |

### Example Request (cURL)
```bash
curl -X POST http://localhost:5000/api/quality \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "batchId": "batch_001_20250507",
    "notes": "Initial inspection started"
  }'
```

### Success Response (201 Created)
```json
{
  "status": "success",
  "data": {
    "test": {
      "id": "test_quality_12345",
      "batchId": "batch_001_20250507",
      "testedBy": null,
      "status": "PENDING",
      "notes": "Initial inspection started",
      "testedAt": null,
      "createdAt": "2025-05-07T10:30:45.123Z"
    }
  }
}
```

### Error Responses

#### 400 - Validation Error
```json
{
  "status": "error",
  "message": "Validation error",
  "code": 400,
  "details": {
    "fields": [
      {
        "message": "\"batchId\" is required",
        "path": ["batchId"]
      }
    ]
  }
}
```

#### 400 - Batch Not Completed
```json
{
  "status": "error",
  "message": "Quality tests can only be created for COMPLETED batches. Current batch status: IN_PRODUCTION",
  "code": 400
}
```

#### 401 - Unauthorized
```json
{
  "status": "error",
  "message": "Authentication required",
  "code": 401
}
```

#### 403 - Forbidden (Insufficient Role)
```json
{
  "status": "error",
  "message": "You do not have permission to access this resource",
  "code": 403
}
```

#### 404 - Batch Not Found
```json
{
  "status": "error",
  "message": "Production batch not found",
  "code": 404
}
```

---

## 2. GET ALL QUALITY TESTS

### Endpoint
```
GET /api/quality
```

### Description
Retrieves a paginated list of all quality tests. Supports filtering by batch ID.

### Authentication
- Required: Yes
- Role: Any authenticated user

### Request Headers
```
Authorization: Bearer <JWT_TOKEN>
```

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| batchId | string | No | - | Filter tests by production batch ID |
| page | number | No | 1 | Page number for pagination (minimum 1) |
| limit | number | No | 20 | Number of items per page (1-100) |

### Example Request (cURL)
```bash
curl -X GET "http://localhost:5000/api/quality?page=1&limit=10&batchId=batch_001_20250507" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Example Request (JavaScript/Fetch)
```javascript
const response = await fetch('http://localhost:5000/api/quality?page=1&limit=10', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer <JWT_TOKEN>',
    'Content-Type': 'application/json'
  }
});
const data = await response.json();
```

### Success Response (200 OK)
```json
{
  "status": "success",
  "items": [
    {
      "id": "test_quality_12345",
      "batchId": "batch_001_20250507",
      "testedBy": "user_tech_001",
      "status": "PASSED",
      "notes": "All quality checks passed",
      "testedAt": "2025-05-07T11:20:30.456Z",
      "createdAt": "2025-05-07T10:30:45.123Z"
    },
    {
      "id": "test_quality_12346",
      "batchId": "batch_002_20250507",
      "testedBy": null,
      "status": "PENDING",
      "notes": "",
      "testedAt": null,
      "createdAt": "2025-05-07T10:35:15.789Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

### Error Responses

#### 400 - Invalid Query Parameters
```json
{
  "status": "error",
  "message": "Validation error",
  "code": 400,
  "details": {
    "fields": [
      {
        "message": "\"limit\" must be less than or equal to 100",
        "path": ["limit"]
      }
    ]
  }
}
```

#### 401 - Unauthorized
```json
{
  "status": "error",
  "message": "Authentication required",
  "code": 401
}
```

---

## 3. GET SPECIFIC QUALITY TEST

### Endpoint
```
GET /api/quality/:id
```

### Description
Retrieves a single quality test by its ID.

### Authentication
- Required: Yes
- Role: Any authenticated user

### Request Headers
```
Authorization: Bearer <JWT_TOKEN>
```

### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | The ID of the quality test (8-128 characters) |

### Example Request (cURL)
```bash
curl -X GET http://localhost:5000/api/quality/test_quality_12345 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Example Request (JavaScript/Fetch)
```javascript
const testId = 'test_quality_12345';
const response = await fetch(`http://localhost:5000/api/quality/${testId}`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer <JWT_TOKEN>',
    'Content-Type': 'application/json'
  }
});
const data = await response.json();
```

### Success Response (200 OK)
```json
{
  "status": "success",
  "data": {
    "test": {
      "id": "test_quality_12345",
      "batchId": "batch_001_20250507",
      "testedBy": "user_tech_001",
      "status": "PASSED",
      "notes": "All quality checks passed successfully",
      "testedAt": "2025-05-07T11:20:30.456Z",
      "createdAt": "2025-05-07T10:30:45.123Z"
    }
  }
}
```

### Error Responses

#### 400 - Invalid ID Format
```json
{
  "status": "error",
  "message": "Validation error",
  "code": 400,
  "details": {
    "fields": [
      {
        "message": "\"id\" length must be at least 8 characters long",
        "path": ["id"]
      }
    ]
  }
}
```

#### 401 - Unauthorized
```json
{
  "status": "error",
  "message": "Authentication required",
  "code": 401
}
```

#### 404 - Test Not Found
```json
{
  "status": "error",
  "message": "Quality test not found",
  "code": 404
}
```

---

## 4. UPDATE QUALITY TEST

### Endpoint
```
PATCH /api/quality/:id
```

### Description
Updates a quality test status and notes. Can only update tests with `PENDING` status. When a test is marked as `FAILED`, notifications are sent to PRODUCTION and QUALITY roles.

### Authentication
- Required: Yes
- Role: ADMIN, QUALITY

### Request Headers
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | The ID of the quality test (8-128 characters) |

### Request Body
```json
{
  "status": "PASSED",
  "notes": "All checks completed successfully"
}
```

### Request Parameters

| Parameter | Type | Required | Valid Values | Description |
|-----------|------|----------|--------------|-------------|
| status | string | Yes | PASSED, FAILED | The test result status |
| notes | string | No | - | Additional notes about the test result (max 1000 characters) |

### Example Request: Mark Test as PASSED (cURL)
```bash
curl -X PATCH http://localhost:5000/api/quality/test_quality_12345 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "status": "PASSED",
    "notes": "All quality checks passed successfully"
  }'
```

### Example Request: Mark Test as FAILED (cURL)
```bash
curl -X PATCH http://localhost:5000/api/quality/test_quality_12345 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "status": "FAILED",
    "notes": "Product dimensions do not meet specifications"
  }'
```

### Example Request (JavaScript/Fetch)
```javascript
const testId = 'test_quality_12345';
const response = await fetch(`http://localhost:5000/api/quality/${testId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': 'Bearer <JWT_TOKEN>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    status: 'PASSED',
    notes: 'All quality checks passed successfully'
  })
});
const data = await response.json();
```

### Success Response: PASSED (200 OK)
```json
{
  "status": "success",
  "data": {
    "test": {
      "id": "test_quality_12345",
      "batchId": "batch_001_20250507",
      "testedBy": "user_tech_001",
      "status": "PASSED",
      "notes": "All quality checks passed successfully",
      "testedAt": "2025-05-07T11:20:30.456Z",
      "createdAt": "2025-05-07T10:30:45.123Z"
    }
  }
}
```

### Success Response: FAILED (200 OK)
```json
{
  "status": "success",
  "data": {
    "test": {
      "id": "test_quality_12345",
      "batchId": "batch_001_20250507",
      "testedBy": "user_tech_001",
      "status": "FAILED",
      "notes": "Product dimensions do not meet specifications",
      "testedAt": "2025-05-07T11:20:30.456Z",
      "createdAt": "2025-05-07T10:30:45.123Z"
    }
  }
}
```

### Error Responses

#### 400 - Invalid Status Value
```json
{
  "status": "error",
  "message": "Validation error",
  "code": 400,
  "details": {
    "fields": [
      {
        "message": "\"status\" must be one of [PASSED, FAILED]",
        "path": ["status"]
      }
    ]
  }
}
```

#### 400 - Test Already Updated
```json
{
  "status": "error",
  "message": "Quality test already has status PASSED and cannot be updated",
  "code": 400
}
```

#### 400 - Invalid ID Format
```json
{
  "status": "error",
  "message": "Validation error",
  "code": 400,
  "details": {
    "fields": [
      {
        "message": "\"id\" length must be at least 8 characters long",
        "path": ["id"]
      }
    ]
  }
}
```

#### 401 - Unauthorized
```json
{
  "status": "error",
  "message": "Authentication required",
  "code": 401
}
```

#### 403 - Forbidden (Insufficient Role)
```json
{
  "status": "error",
  "message": "You do not have permission to access this resource",
  "code": 403
}
```

#### 404 - Test Not Found
```json
{
  "status": "error",
  "message": "Quality test not found",
  "code": 404
}
```

---

## Common Response Codes

| Code | Description |
|------|-------------|
| 200 | OK - Request successful |
| 201 | Created - Resource successfully created |
| 400 | Bad Request - Validation error or business rule violation |
| 401 | Unauthorized - Authentication required or failed |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 500 | Internal Server Error - Server error |

---

## Field Validation Rules

### Quality Test ID
- Type: String
- Length: 8-128 characters
- Auto-generated by the system

### Batch ID
- Type: String
- Length: 8-128 characters
- Required for test creation
- Batch must exist and have COMPLETED status

### Notes
- Type: String
- Maximum Length: 1000 characters
- Optional
- Trimmed automatically

### Status
- Type: String
- Valid Values: PENDING, PASSED, FAILED
- PENDING: Initial status when test is created
- PASSED: Test completed successfully
- FAILED: Test failed inspection

### testedBy
- Type: String (User ID) or null
- Set automatically to the user ID when test status is updated
- null if test is still PENDING

### Pagination
- Page: Integer, minimum 1, default 1
- Limit: Integer, 1-100, default 20

---

## Business Rules

1. **Quality Tests can only be created for COMPLETED batches**
   - A production batch must have status COMPLETED before a quality test can be created

2. **Quality Tests start as PENDING**
   - All newly created tests have status PENDING

3. **Quality Tests can only be updated once**
   - A test with status PENDING can be updated
   - Once a test has status PASSED or FAILED, it cannot be updated

4. **FAILED tests trigger notifications**
   - When a test is marked as FAILED, alerts are sent to PRODUCTION and QUALITY roles
   - Notification includes batch ID information

5. **Audit logging**
   - All operations (CREATE, UPDATE with PASSED/FAILED) are logged for audit purposes

---

## Date Format

All date fields are returned in ISO 8601 format (UTC):
- Format: `YYYY-MM-DDTHH:mm:ss.sssZ`
- Example: `2025-05-07T11:20:30.456Z`

---

## Example Workflow

### 1. Create a Quality Test
```bash
POST /api/quality
{
  "batchId": "batch_001_20250507",
  "notes": "Starting quality inspection"
}
```

### 2. Retrieve the Test
```bash
GET /api/quality/test_quality_12345
```

### 3. List All Tests
```bash
GET /api/quality?page=1&limit=10
```

### 4. Complete the Test (PASSED)
```bash
PATCH /api/quality/test_quality_12345
{
  "status": "PASSED",
  "notes": "All quality checks passed"
}
```

---

## Testing Tips

1. Ensure you have a valid JWT token with either ADMIN or QUALITY role for POST and PATCH operations
2. Ensure the production batch exists and has COMPLETED status before creating quality tests
3. Use descriptive notes to track quality inspection details
4. Handle FAILED status tests carefully as they trigger notifications

---

## Support

For API issues or questions, please contact the development team.
