const socketIo = require('socket.io');

let io;

function initSocket(server) {
    io = socketIo(server, { cors: { origin: '*' } });

    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        // Join specific order room
        socket.on('joinOrder', (orderId) => {
            console.log(`User joined order: ${orderId}`);
            socket.join(orderId);
        });

        // Join vendor room
        socket.on('joinVendor', (vendorId) => {
            console.log(`Vendor joined: ${vendorId}`);
            socket.join(`vendor_${vendorId}`);
        });

        // Join global delivery personnel room
        socket.on('joinDelivery', (deliveryPersonId) => {
            console.log(`Delivery person joined: ${deliveryPersonId}`);
            socket.join(`delivery_${deliveryPersonId}`);
            socket.join('delivery_persons');  // This makes them receive new order alerts
        });

        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
        });
    });
}

function getIo() {
    return io;
}

module.exports = { initSocket, getIo };
