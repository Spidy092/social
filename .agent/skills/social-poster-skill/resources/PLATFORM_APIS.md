# Platform API Reference

## Instagram (Meta Graph API v18)

Endpoint base: https://graph.facebook.com/v18.0

### Post an image
1. POST /{ig-user-id}/media
   body: { image_url, caption, access_token }
   → returns: { id: container_id }

2. Poll /{container_id}?fields=status_code&access_token=...
   Wait until status_code === 'FINISHED' (poll every 5s, max 10 attempts)

3. POST /{ig-user-id}/media_publish
   body: { creation_id: container_id, access_token }
   → returns: { id: published_media_id }

### Post a Reel (video)
Same flow but step 1 uses: { media_type: 'REELS', video_url, caption }

### Get IG user ID
GET /me?fields=id,username&access_token=...

---

## Facebook (Meta Graph API v18)

Same access token as Instagram.

### Get Page ID
GET /me/accounts?access_token=...
→ returns array of pages, take first one: { id: page_id, access_token: page_token }

### Post image to Page
POST /{page_id}/photos
body: { url: mediaUrl, caption, access_token: page_token }

### Post video to Page
POST /{page_id}/videos
body: { file_url: mediaUrl, description: caption, access_token: page_token }

---

## LinkedIn (Marketing API v2)

Base: https://api.linkedin.com

### Get person URN
GET /v2/userinfo  (Bearer token)
→ returns: { sub: person_id }
URN = `urn:li:person:{person_id}`

### Post image
1. POST /v2/assets?action=registerUpload
   body: { registerUploadRequest: { owner: personUrn, recipes: ['urn:li:digitalmediaRecipe:feedshare-image'] } }
   → returns: { value: { uploadMechanism: { 'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': { uploadUrl } }, asset } }

2. PUT {uploadUrl}  (binary image data, Content-Type: image/jpeg or image/png)

3. POST /v2/ugcPosts
   body: {
     author: personUrn,
     lifecycleState: 'PUBLISHED',
     specificContent: {
       'com.linkedin.ugc.ShareContent': {
         shareCommentary: { text: caption },
         shareMediaCategory: 'IMAGE',
         media: [{ status: 'READY', originalUrl: mediaUrl, media: assetUrn }]
       }
     },
     visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
   }

### Post text only (no media)
Same as above but shareMediaCategory: 'NONE' and no media array.

---

## YouTube (Data API v3)

Base: https://www.googleapis.com

### Upload video (resumable)
1. POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
   Headers: { Authorization: Bearer token, Content-Type: application/json, X-Upload-Content-Type: video/mp4 }
   Body: {
     snippet: { title: caption.slice(0,100), description: caption, categoryId: '22' },
     status: { privacyStatus: 'public' }
   }
   → returns: Location header with resumable upload URL

2. PUT {resumable_upload_url}
   Headers: { Content-Type: video/mp4, Content-Length: filesize }
   Body: video file binary
   → returns: { id: videoId }

### YouTube Shorts
A video is automatically treated as a Short if:
- Duration ≤ 60 seconds
- Vertical aspect ratio (9:16)
- Title or description includes #Shorts

### Images
YouTube does NOT support image posts. If mediaType === 'image', throw:
new Error('YouTube only supports video posts. Please upload a video file.')

---

## Token refresh pattern (all platforms)

```javascript
async function callWithRefresh(platform, connection, apiFn) {
  try {
    return await apiFn(connection.access_token);
  } catch (err) {
    if (err.response?.status === 401 && connection.refresh_token) {
      const newToken = await refreshToken(platform, connection.refresh_token);
      await db.query(
        'UPDATE platform_connections SET access_token=$1, token_expires_at=$2 WHERE id=$3',
        [newToken.access_token, newToken.expires_at, connection.id]
      );
      return await apiFn(newToken.access_token);
    }
    throw err;
  }
}
```

## OAuth state param (CSRF protection)

Use a short-lived signed value as the state param. Simple implementation:
```javascript
const crypto = require('crypto');
function generateState() {
  return crypto.randomBytes(16).toString('hex');
}
// Store in session: req.session.oauthState = state
// Verify on callback: if (req.query.state !== req.session.oauthState) return res.redirect('/platforms?error=csrf')
```
