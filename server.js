require('dotenv').config(); // Load environment variables from a .env file

const express = require('express');
const mysql = require('mysql2/promise'); // Use the promise-based API
const cors = require('cors');

const app = express();
const port = 3000; // You can change this port if needed

// Middleware to parse JSON bodies
app.use(express.json());

// Middleware to enable CORS (allow requests from your front-end)
app.use(cors());

// Database connection pool
const dbPool = mysql.createPool({
    host: 'localhost', // Your MySQL host (usually localhost)
    user: 'root',      // Your MySQL username
    password: 'navu',  // Your MySQL password (replace with env var in production)
    database: 'foodfleet_db', // The database we created
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test database connection
dbPool.getConnection()
    .then(connection => {
        console.log('Database connected successfully!');
        connection.release(); // Release the connection
    })
    .catch(err => {
        console.error('Database connection failed:', err.stack);
        // Exit the process if database connection fails
        process.exit(1);
    });

// --- API Endpoints ---

// GET endpoint to fetch restaurants and their menus
app.get('/api/restaurants', async (req, res) => {
    try {
        // Fetch all restaurants
        const [restaurants] = await dbPool.query('SELECT * FROM restaurants');

        // Fetch menus for all restaurants
        const [menuItems] = await dbPool.query('SELECT * FROM menu_items');

        // Combine restaurants with their menu items
        const restaurantsWithMenus = restaurants.map(restaurant => {
            const menu = menuItems.filter(item => item.restaurant_id === restaurant.restaurant_id);
            return {
                ...restaurant,
                menu: menu
            };
        });

        res.json(restaurantsWithMenus);

    } catch (error) {
        console.error('Error fetching restaurants:', error);
        res.status(500).json({ message: 'Error fetching data' });
    }
});

// POST endpoint to submit a new order
app.post('/api/orders', async (req, res) => {
    const {
        restaurant_id,
        cart_items, // Array of { item_id, quantity, price }
        total_amount,
        customer_name,
        customer_phone,
        customer_email,
        delivery_address,
        city,
        state,
        pin_code,
        delivery_instructions,
        payment_method,
        promo_code_applied,
        discount_amount,
        delivery_fee,
        taxes_amount
    } = req.body;

    // Basic validation (you'll need more robust validation)
    if (!restaurant_id || !cart_items || cart_items.length === 0 || !total_amount || !customer_name || !delivery_address || !city || !state || !pin_code) {
        return res.status(400).json({ message: 'Missing required order information.' });
    }

    let connection;
    try {
        connection = await dbPool.getConnection();
        await connection.beginTransaction(); // Start a transaction

        // Insert the main order
        const [orderResult] = await connection.query(
            'INSERT INTO orders (restaurant_id, total_amount, customer_name, customer_phone, customer_email, delivery_address, city, state, pin_code, delivery_instructions, payment_method, promo_code_applied, discount_amount, delivery_fee, taxes_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [restaurant_id, total_amount, customer_name, customer_phone, customer_email, delivery_address, city, state, pin_code, delivery_instructions, payment_method, promo_code_applied, discount_amount, delivery_fee, taxes_amount]
        );

        const orderId = orderResult.insertId;

        // Insert the order items
        const orderItemsData = cart_items.map(item => [
            orderId,
            item.item_id,
            item.quantity,
            item.price // price_at_order_time
        ]);

        if (orderItemsData.length > 0) {
            await connection.query(
                'INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_order_time) VALUES ?',
                [orderItemsData] // MySQL2 handles batch inserts with this format
            );
        }

        await connection.commit(); // Commit the transaction
        res.status(201).json({ message: 'Order placed successfully!', orderId: orderId });

    } catch (error) {
        if (connection) await connection.rollback(); // Rollback on error
        console.error('Error placing order:', error);
        res.status(500).json({ message: 'Error placing order' });
    } finally {
        if (connection) connection.release(); // Release the connection
    }
});

// POST endpoint to submit a help inquiry
app.post('/api/help', async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ message: 'Name, email, and message are required.' });
    }

    try {
        await dbPool.query(
            'INSERT INTO help_inquiries (customer_name, customer_email, message) VALUES (?, ?, ?)',
            [name, email, message]
        );
        res.status(201).json({ message: 'Help inquiry submitted successfully!' });
    } catch (error) {
        console.error('Error submitting help inquiry:', error);
        res.status(500).json({ message: 'Error submitting inquiry' });
    }
});


// Start the server
app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
});
