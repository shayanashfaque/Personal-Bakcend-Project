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

// Court model 
const Court = mongoose.model('Court', {
  court_id: Number,
  name: String,
  location: String,
  pricePerHour: Number,
  available: { type: Boolean, default: true }
})
//User model
const User=mongoose.model('User',{
  user_id:Number, 
  name:String,
   email: String,
   password:String, 
   role:{type:String, default:"User" }
})

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
//Add a new user
app.post('/api/user/register', async (req, res)=>{
  const { name,email, password}=req.body
  const user=new User({name,email,password})
  await user.save()
  res.json(user)

})

app.get('/api/user',async (req,res)=>{
   const user=await User.find()
   res.json(user)

})

// Test route: user info
app.get('/api/user', (req,res) => {
  res.json({
    name: "Shayan",
    age: 24,
    role: "Developer"
  })
})



// ---------------------
// Start Server
// ---------------------
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`)
})
