require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { initSocket } = require('./socket');
const PORT = process.env.PORT || 3001;
const app = express();
const http = require('http');
const server = http.createServer(app);

initSocket(server); // Initialize the socket here

const authRouter = require('./routes/auths');
const collegeRouter = require('./routes/colleges');
const vendorRouter = require('./routes/vendor');
const menuItemRouter = require('./routes/menuItems');
const deliveryPersonRouter = require('./routes/deliveryPerson');
const ordersRouter = require("./routes/orders");
const orderMenuItemsRouter = require("./routes/orderMenuItems");

app.use(cors());
app.use(express.json({ limit: "50mb" })); // Increase limit for JSON
app.use(express.urlencoded({ limit: "50mb", extended: true })); // Increase limit for form data
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.get('/', (req, res) => {
    res.status(200).json({
        message: "Hello there, sosika backend here"
    });
});

app.use('/api/auth', authRouter);
app.use('/api/', collegeRouter);
app.use('/api/', vendorRouter);
app.use('/api/', menuItemRouter);
app.use('/api/', deliveryPersonRouter);
app.use("/api/", ordersRouter);
app.use("/api/", orderMenuItemsRouter);

server.listen(PORT, () => {
    console.log(`Sosika backend running on port ${PORT}`);
});
