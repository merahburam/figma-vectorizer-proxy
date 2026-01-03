const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all origins (needed for Figma plugin)
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  })
);

// Parse JSON bodies
app.use(express.json({ limit: "10mb" }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Figma VectorCraft Proxy Server",
    endpoints: {
      "POST /predictions": "Create AI vectorization prediction",
      "GET /predictions/:id": "Get prediction status/result",
      "POST /validate-reset-key":
        "Validate secure reset keys for VectorCraft plugin",
      "POST /sync-credits": "Sync user credits to database",
      "GET /sync-credits/:userId": "Get user credits from database",
      "POST /log-purchase": "Log Gumroad purchase to database",
    },
    usage: "API key managed server-side via environment variable",
    database: process.env.DATABASE_URL ? "connected" : "not configured",
  });
});

// Proxy endpoint for creating predictions
app.post("/predictions", async (req, res) => {
  try {
    // Use server-side environment variable for API key (more secure)
    const apiKey = process.env.REPLICATE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error:
          "Server configuration error: REPLICATE_API_KEY environment variable not set",
      });
    }

    console.log("🚀 Creating prediction with Replicate API...");
    console.log("Model:", req.body.version?.split(":")[0] || "unknown");
    console.log("Image size:", req.body.input?.image?.length || 0, "chars");

    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ Replicate API error:", response.status, result);
      return res.status(response.status).json(result);
    }

    console.log("✅ Prediction created:", result.id);
    res.json(result);
  } catch (error) {
    console.error("❌ Server error:", error.message);
    res.status(500).json({
      error: "Proxy server error",
      message: error.message,
    });
  }
});

// Proxy endpoint for checking prediction status
app.get("/predictions/:id", async (req, res) => {
  try {
    // Use server-side environment variable for API key (more secure)
    const apiKey = process.env.REPLICATE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error:
          "Server configuration error: REPLICATE_API_KEY environment variable not set",
      });
    }

    const predictionId = req.params.id;
    console.log("🔄 Checking prediction status:", predictionId);

    const response = await fetch(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Token ${apiKey}`,
        },
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ Replicate API error:", response.status, result);
      return res.status(response.status).json(result);
    }

    console.log("📊 Prediction status:", result.status);
    if (result.status === "succeeded") {
      console.log("🎉 Prediction completed successfully!");
    } else if (result.status === "failed") {
      console.log("💥 Prediction failed:", result.error);
    }

    res.json(result);
  } catch (error) {
    console.error("❌ Server error:", error.message);
    res.status(500).json({
      error: "Proxy server error",
      message: error.message,
    });
  }
});

// Secure reset key validation endpoint for VectorCraft plugin
app.post("/validate-reset-key", async (req, res) => {
  try {
    const { resetKey } = req.body;

    console.log("🔐 Validating reset key for VectorCraft plugin...");

    if (!resetKey) {
      return res.status(400).json({
        success: false,
        message: "Reset key is required",
      });
    }

    // Secure reset keys - stored server-side only, never in client code
    // These keys are completely secure and cannot be extracted from client inspection
    const SECURE_RESET_KEYS = {
      // Reset to default (3 credits) - for testing and admin use
      VECTORCRAFT_RESET_DEFAULT_2024: {
        resetType: "default",
        creditsGranted: 0, // Not used for reset operations
        message: "Credits reset to default (3 credits)",
      },
      // Reset to zero - for testing edge cases
      VECTORCRAFT_RESET_ZERO_2024: {
        resetType: "zero",
        creditsGranted: 0,
        message: "Credits reset to zero",
      },
      // Development key (reset to default) - for development/testing
      DEV_RESET_CREDITS_2024: {
        resetType: "default",
        creditsGranted: 0,
        message: "Development reset to default (3 credits)",
      },
      // Additional secure keys can be added here as needed
      VECTORCRAFT_ADMIN_RESET_2024: {
        resetType: "default",
        creditsGranted: 0,
        message: "Admin reset to default (3 credits)",
      },
      // Customer support recovery keys - for users who lost credits due to storage issues
      RESTORE_PJ_ORDER_weYK1_500_2026: {
        resetType: "recovery",
        creditsGranted: 500,
        message:
          "Credits restored: Starter Pack (500 credits) - Order weYK1fdLBkt4Z1oLctYF2g==",
      },
      // Test recovery key - for testing the recovery flow before sending to customers
      TEST_RECOVERY_KEY_100_2026: {
        resetType: "recovery",
        creditsGranted: 100,
        message: "Test credits added: 100 credits for testing recovery system",
      },
    };

    if (SECURE_RESET_KEYS[resetKey]) {
      console.log(
        "✅ Valid reset key found:",
        SECURE_RESET_KEYS[resetKey].resetType
      );
      res.json({
        success: true,
        ...SECURE_RESET_KEYS[resetKey],
      });
    } else {
      console.log("❌ Invalid reset key provided");
      res.json({
        success: false,
        message: "Invalid reset key",
      });
    }
  } catch (error) {
    console.error("❌ Reset key validation error:", error.message);
    res.status(500).json({
      success: false,
      message: "Reset key validation failed",
    });
  }
});

// Credit synchronization endpoints for cross-platform consistency
app.post("/sync-credits", async (req, res) => {
  try {
    const { userId, creditData } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required for credit sync",
      });
    }

    // Save to PostgreSQL database for persistence
    const savedBalance = await db.saveCreditBalance(userId, creditData);

    if (savedBalance) {
      console.log(
        "💾 Credits synced to database for user:",
        userId,
        "Credits:",
        creditData.maxImages - creditData.usedImages
      );

      // Log transaction for audit trail
      await db.logCreditTransaction(
        userId,
        "SYNC",
        0, // No change, just sync
        creditData.maxImages - creditData.usedImages,
        "Credit sync from client",
        { source: "client_sync" }
      );

      res.json({
        success: true,
        message: "Credits synced successfully to database",
        creditData: creditData,
      });
    } else {
      // Fallback to in-memory if database unavailable
      if (!global.userCredits) {
        global.userCredits = new Map();
      }
      global.userCredits.set(userId, creditData);

      console.log(
        "⚠️  Credits synced to memory (database unavailable) for user:",
        userId
      );

      res.json({
        success: true,
        message: "Credits synced successfully (in-memory fallback)",
        creditData: creditData,
      });
    }
  } catch (error) {
    console.error("❌ Credit sync error:", error.message);
    res.status(500).json({
      success: false,
      message: "Credit sync failed",
    });
  }
});

app.get("/sync-credits/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Retrieve credit balance from database
    const balance = await db.getCreditBalance(userId);

    if (balance && balance.total_credits !== undefined) {
      const creditData = {
        usedImages: balance.used_credits,
        maxImages: balance.total_credits,
        hasCredits: balance.remaining_credits > 0,
        usedLicenses: [], // Will be populated from purchases if needed
      };

      console.log(
        "📥 Credits retrieved from database for user:",
        userId,
        "Credits:",
        balance.remaining_credits
      );
      res.json({
        success: true,
        creditData: creditData,
      });
    } else {
      // Fallback to in-memory if database unavailable
      if (!global.userCredits) {
        global.userCredits = new Map();
      }

      const creditData = global.userCredits.get(userId) || {
        usedImages: 0,
        maxImages: 3,
        hasCredits: false,
        usedLicenses: [],
      };

      console.log(
        "⚠️  Credits retrieved from memory (database unavailable) for user:",
        userId
      );
      res.json({
        success: true,
        creditData: creditData,
      });
    }
  } catch (error) {
    console.error("❌ Credit retrieval error:", error.message);
    res.status(500).json({
      success: false,
      message: "Credit retrieval failed",
    });
  }
});

// Purchase logging endpoint - stores Gumroad purchases for future recovery
app.post("/log-purchase", async (req, res) => {
  try {
    const { userId, licenseKey, purchaseData } = req.body;

    if (!userId || !licenseKey) {
      return res.status(400).json({
        success: false,
        message: "User ID and license key are required",
      });
    }

    // Check if this license has already been used by a different user
    const existingPurchase = await db.checkLicenseKey(licenseKey);

    if (existingPurchase && existingPurchase.user_id !== userId) {
      console.log(
        "⚠️  License key already used by different user:",
        existingPurchase.user_id
      );
      return res.status(409).json({
        success: false,
        message: "This license key has already been used by another user",
        conflict: true,
      });
    }

    // Log the purchase to database
    const loggedPurchase = await db.logPurchase(
      userId,
      licenseKey,
      purchaseData
    );

    if (loggedPurchase) {
      console.log("💾 Purchase logged to database:", loggedPurchase.id);

      // Update user's credit balance
      const currentBalance = await db.getCreditBalance(userId);
      const newTotalCredits =
        (currentBalance?.total_credits || 0) + purchaseData.creditsGranted;

      await db.saveCreditBalance(userId, {
        maxImages: newTotalCredits,
        usedImages: currentBalance?.used_credits || 0,
      });

      // Log the credit addition transaction
      await db.logCreditTransaction(
        userId,
        "PURCHASE",
        purchaseData.creditsGranted,
        newTotalCredits - (currentBalance?.used_credits || 0),
        `Purchase: ${purchaseData.tier} (${purchaseData.creditsGranted} credits)`,
        {
          license_key: licenseKey,
          product_tier: purchaseData.tier,
          order_id: purchaseData.sale_id,
        }
      );

      res.json({
        success: true,
        message: "Purchase logged successfully",
        purchase: loggedPurchase,
        newBalance: newTotalCredits - (currentBalance?.used_credits || 0),
      });
    } else {
      // Database unavailable, return success anyway
      console.warn("⚠️  Database unavailable, purchase not logged");
      res.json({
        success: true,
        message: "Purchase processed (database unavailable)",
        warning: "Purchase not logged to database",
      });
    }
  } catch (error) {
    console.error("❌ Purchase logging error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to log purchase",
    });
  }
});

// Catch all other routes
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    availableRoutes: [
      "GET /",
      "POST /predictions",
      "GET /predictions/:id",
      "POST /validate-reset-key",
      "POST /sync-credits",
      "GET /sync-credits/:userId",
    ],
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("❌ Unhandled error:", error);
  res.status(500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Something went wrong",
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database connection and create tables
    console.log("🔧 Initializing database...");
    await db.createTables();
    console.log("✅ Database initialized successfully");
  } catch (error) {
    console.error("❌ Database initialization failed:", error.message);
    console.warn("⚠️  Server will continue without persistent storage");
  }

  app.listen(PORT, () => {
    console.log("🚀 Figma VectorCraft Proxy Server");
    console.log(`📡 Server running on port ${PORT}`);
    console.log(`🌍 Health check: http://localhost:${PORT}`);
    console.log("");
    console.log("🔧 Ready to proxy Replicate API calls");
    console.log(
      "💡 API key managed via REPLICATE_API_KEY environment variable"
    );
    console.log(
      "💾 Database:",
      process.env.DATABASE_URL
        ? "PostgreSQL connected"
        : "In-memory fallback mode"
    );
    console.log("");
    console.log("📋 Endpoints:");
    console.log(
      `   POST ${
        PORT === 3001
          ? "http://localhost:3001"
          : process.env.RAILWAY_STATIC_URL || "https://your-app.railway.app"
      }/predictions`
    );
    console.log(
      `   GET  ${
        PORT === 3001
          ? "http://localhost:3001"
          : process.env.RAILWAY_STATIC_URL || "https://your-app.railway.app"
      }/predictions/{id}`
    );
    console.log(
      `   POST ${
        PORT === 3001
          ? "http://localhost:3001"
          : process.env.RAILWAY_STATIC_URL || "https://your-app.railway.app"
      }/validate-reset-key`
    );
    console.log(
      `   POST ${
        PORT === 3001
          ? "http://localhost:3001"
          : process.env.RAILWAY_STATIC_URL || "https://your-app.railway.app"
      }/log-purchase`
    );
    console.log("");
    console.log(
      "🔐 Secure reset keys configured for VectorCraft credit management"
    );
  });
}

// Start the server
startServer();
