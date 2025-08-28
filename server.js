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
      'GET /predictions/:id': 'Get prediction status/result',
      'POST /validate-reset-key': 'Validate secure reset keys for Aleto plugin'
    },
    usage: 'API key managed server-side via environment variable'
  });
});

// Proxy endpoint for creating predictions
app.post('/predictions', async (req, res) => {
  try {
    // Use server-side environment variable for API key (more secure)
    const apiKey = process.env.REPLICATE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Server configuration error: REPLICATE_API_KEY environment variable not set' 
      });
    }

    console.log('🚀 Creating prediction with Replicate API...');
    console.log('Model:', req.body.version?.split(':')[0] || 'unknown');
    console.log('Image size:', req.body.input?.image?.length || 0, 'chars');

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
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
    // Use server-side environment variable for API key (more secure)
    const apiKey = process.env.REPLICATE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Server configuration error: REPLICATE_API_KEY environment variable not set' 
      });
    }

    const predictionId = req.params.id;
    console.log('🔄 Checking prediction status:', predictionId);

    const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiKey}`,
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

// Secure reset key validation endpoint for Aleto plugin
app.post('/validate-reset-key', async (req, res) => {
  try {
    const { resetKey } = req.body;
    
    console.log('🔐 Validating reset key for Aleto plugin...');
    
    if (!resetKey) {
      return res.status(400).json({
        success: false,
        message: 'Reset key is required'
      });
    }

    // Secure reset keys - stored server-side only, never in client code
    // These keys are completely secure and cannot be extracted from client inspection
    const SECURE_RESET_KEYS = {
      // Reset to default (2 credits) - for testing and admin use
      'ALETO_RESET_DEFAULT_2024': {
        resetType: 'default',
        creditsGranted: 0, // Not used for reset operations
        message: 'Credits reset to default (2 credits)'
      },
      // Reset to zero - for testing edge cases
      'ALETO_RESET_ZERO_2024': {
        resetType: 'zero', 
        creditsGranted: 0,
        message: 'Credits reset to zero'
      },
      // Development key (reset to default) - for development/testing
      'DEV_RESET_CREDITS_2024': {
        resetType: 'default',
        creditsGranted: 0,
        message: 'Development reset to default (2 credits)'
      },
      // Additional secure keys can be added here as needed
      'ALETO_ADMIN_RESET_2024': {
        resetType: 'default',
        creditsGranted: 0,
        message: 'Admin reset to default (2 credits)'
      }
    };
    
    if (SECURE_RESET_KEYS[resetKey]) {
      console.log('✅ Valid reset key found:', SECURE_RESET_KEYS[resetKey].resetType);
      res.json({
        success: true,
        ...SECURE_RESET_KEYS[resetKey]
      });
    } else {
      console.log('❌ Invalid reset key provided');
      res.json({
        success: false,
        message: 'Invalid reset key'
      });
    }
    
  } catch (error) {
    console.error('❌ Reset key validation error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Reset key validation failed'
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
      'GET /predictions/:id',
      'POST /validate-reset-key'
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
  console.log('💡 API key managed via REPLICATE_API_KEY environment variable');
  console.log('');
  console.log('📋 Endpoints:');
  console.log(`   POST ${PORT === 3001 ? 'http://localhost:3001' : process.env.RAILWAY_STATIC_URL || 'https://your-app.railway.app'}/predictions`);
  console.log(`   GET  ${PORT === 3001 ? 'http://localhost:3001' : process.env.RAILWAY_STATIC_URL || 'https://your-app.railway.app'}/predictions/{id}`);
  console.log(`   POST ${PORT === 3001 ? 'http://localhost:3001' : process.env.RAILWAY_STATIC_URL || 'https://your-app.railway.app'}/validate-reset-key`);
  console.log('');
  console.log('🔐 Secure reset keys configured for Aleto credit management');
});