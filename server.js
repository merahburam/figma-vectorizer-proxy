const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all origins (needed for Figma plugin)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Figma AI Rotation Proxy Server',
    endpoints: {
      'POST /predictions': 'Create AI rotation prediction',
      'GET /predictions/:id': 'Get prediction status/result'
    },
    usage: 'Include Authorization: Token YOUR_REPLICATE_API_KEY header'
  });
});

// Proxy endpoint for creating predictions
app.post('/predictions', async (req, res) => {
  try {
    const apiKey = req.headers.authorization;
    if (!apiKey || !apiKey.startsWith('Token ')) {
      return res.status(401).json({ 
        error: 'Missing or invalid Authorization header. Use: Authorization: Token YOUR_API_KEY' 
      });
    }

    console.log('🚀 Creating prediction with Replicate API...');
    console.log('Model:', req.body.version?.split(':')[0] || 'unknown');
    console.log('Image size:', req.body.input?.image?.length || 0, 'chars');

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body)
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('❌ Replicate API error:', response.status, result);
      return res.status(response.status).json(result);
    }

    console.log('✅ Prediction created:', result.id);
    res.json(result);

  } catch (error) {
    console.error('❌ Server error:', error.message);
    res.status(500).json({ 
      error: 'Proxy server error', 
      message: error.message 
    });
  }
});

// Proxy endpoint for checking prediction status
app.get('/predictions/:id', async (req, res) => {
  try {
    const apiKey = req.headers.authorization;
    if (!apiKey || !apiKey.startsWith('Token ')) {
      return res.status(401).json({ 
        error: 'Missing or invalid Authorization header. Use: Authorization: Token YOUR_API_KEY' 
      });
    }

    const predictionId = req.params.id;
    console.log('🔄 Checking prediction status:', predictionId);

    const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      method: 'GET',
      headers: {
        'Authorization': apiKey,
      }
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('❌ Replicate API error:', response.status, result);
      return res.status(response.status).json(result);
    }

    console.log('📊 Prediction status:', result.status);
    if (result.status === 'succeeded') {
      console.log('🎉 Prediction completed successfully!');
    } else if (result.status === 'failed') {
      console.log('💥 Prediction failed:', result.error);
    }

    res.json(result);

  } catch (error) {
    console.error('❌ Server error:', error.message);
    res.status(500).json({ 
      error: 'Proxy server error', 
      message: error.message 
    });
  }
});

// Catch all other routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    availableRoutes: [
      'GET /',
      'POST /predictions', 
      'GET /predictions/:id'
    ]
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

app.listen(PORT, () => {
  console.log('🚀 Figma AI Rotation Proxy Server');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌍 Health check: http://localhost:${PORT}`);
  console.log('');
  console.log('🔧 Ready to proxy Replicate API calls');
  console.log('💡 Include Authorization: Token YOUR_REPLICATE_API_KEY in requests');
  console.log('');
  console.log('📋 Endpoints:');
  console.log(`   POST ${PORT === 3001 ? 'http://localhost:3001' : process.env.RAILWAY_STATIC_URL || 'https://your-app.railway.app'}/predictions`);
  console.log(`   GET  ${PORT === 3001 ? 'http://localhost:3001' : process.env.RAILWAY_STATIC_URL || 'https://your-app.railway.app'}/predictions/{id}`);
});