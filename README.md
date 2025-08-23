# Figma AI Rotation Proxy Server

Proxy server for Figma AI rotation plugin - bypasses CORS restrictions for Replicate API calls.

## Features

- ✅ CORS bypass for Figma plugins
- ✅ Real Wonder3D, Zero123++, TripoSR API calls
- ✅ Automatic error handling and retries
- ✅ Railway deployment ready

## Endpoints

- `GET /` - Health check
- `POST /predictions` - Create AI rotation prediction
- `GET /predictions/:id` - Check prediction status

## Usage

Include your Replicate API key in requests:
```
Authorization: Token YOUR_REPLICATE_API_KEY
```

## Deploy to Railway

Click to deploy:

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/2hx5LJ)

Or manually:
```bash
git clone this-repo
cd server
npm install
npm start
```