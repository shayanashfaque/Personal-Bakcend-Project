const mongoose = require('mongoose')
require('dotenv').config()
const express = require('express')
const app = express()

// Port
const port = process.env.PORT || 3000

// Middleware
app.use(express.json()) 
app.use(express.static('public'))

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err))

// Court model (replacing Notes)
const Court = mongoose.model('Court', {
  name: String,
  location: String,
  pricePerHour: Number,
  available: { type: Boolean, default: true }
})

// ---------------------
// Routes
// ---------------------

// COURTS
// Get all courts
app.get('/api/courts', async (req, res) => {
  const courts = await Court.find()
  res.json(courts)
})

// Add a new court (admin/testing)
app.post('/api/courts', async (req, res) => {
  const { name, location, pricePerHour } = req.body
  const court = new Court({ name, location, pricePerHour })
  await court.save()
  res.json(court)
})

// Test route: user info
app.get('/api/user', (req,res) => {
  res.json({
    name: "Shayan",
    age: 24,
    role: "Developer"
  })
})

// Route parameter example
app.get('/hello/:name', (req, res) => {
  res.send(`Hello, ${req.params.name}!`)
})

// ---------------------
// Start Server
// ---------------------
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`)
})
