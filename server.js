const Minio = require("minio");
const Push = require('./Modules/Push');
const app = require('express')();
const fs = require('fs');
const path = require('path');
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });
const cors = require('cors');
const bodyParser = require('body-parser');
const socket = require('./Modules/Socket');
const Users = require('./Routes/Users');
const Payme = require('./Routes/Payme.js');
const Admin = require('./Routes/Admin');
const Reborn = require('./Routes/Reborn');
const Merchant = require('./Routes/Merchant');
const port = 7790;

const axios = require('axios');
const cheerio = require('cheerio');
const stringSimilarity = require('string-similarity');
global.ReadableStream = require("stream/web").ReadableStream;


process.env.SECRET_KEY = "tirgoserverkey";
process.env.FILES_PATCH = "/var/www/html/";
process.env.SERVER_URL = "https://tirgo.io/";

app.get('/', function (req, res) {
    res.send('<h1>tirgo glad you!!!</h1>');
});
// Enable CORS for Socket.io
io.origins('*:*'); // Adjust this based on your requirements
io.use((socket, next) => {
    // Set CORS headers for Socket.io
    socket.handshake.headers.origin = socket.handshake.headers.origin || '*';
    next();
});
try {
    socket.init(io);
}
catch (err) {
    console.log('Socket io error: ', err)
}
// Push.send(`cp-LEtYvbeg:APA91bHOC5yK8UWNtbmvPJzoE9tTiEuzDd37AQeRwZdxgEN9lw8f4SpTuz6arfuFXQiidEYeeVWLM8quQTWoCJ8TWyVhJNDGteLE4SmfjP70XKnb1CcxFLlwm6S27qeKilXW-pi82gqh`, 'Пополнение баланса','Ваш баланс пополнен на ' + '100' ,'','');
const corsOptions = {
    origin: '*', // Replace with the address of your Ionic app
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204,
    preflightContinue: true, // Handle preflight requests
};
app.use(cors());
app.options('*', cors());
app.use(bodyParser.json({ limit: '150mb' }));
app.use(bodyParser.urlencoded({
    extended: true
}));
http.on('request', (req, res) => {
    //console.log(req)
});

app.get('/download/:filename', (req, res) => {
    // console.log('/downloadImage')
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);

    res.download(filePath, (err) => {
        if (err) {
            console.error(err);
            res.status(404).send('File not found');
        }
    });
});

app.use('/users', Users);
app.use('/api', Payme);
app.use('/admin', Admin);
app.use('/reborn', Reborn);
app.use('/merchant', Merchant);
require('./Routes/rabbit.js')

http.on('listening', function () {
    console.log('ok, server is running');   
});


async function parseProduct_erichkrause(itemName, productId) {
    try {
        // Normalize item name
        itemName = itemName.trim().replace(/\s+/g, ' ');
console.log(itemName)
        const url = `https://www.erichkrause.com/en/search/?search_cat=&q=${encodeURIComponent(itemName)}`;
        console.log(url)
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // Check for search results
        const searchResults = $('div.SPI.FB.FB_C.MW1070_FB_M.MW820_FB_M').text();
        if (!searchResults.includes('Товары')) {
            return { found: false, name: itemName, reason: 1 };
        }

        // Find all products
        const allFound = $('.product-card');
        if (!allFound.length) return { found: false, name: itemName, reason: 1 };

        let bestMatchItem = null;
        let highestSimilarity = 0;

        // Compare item names for the best match
        for (const foundItem of allFound.toArray()) {
            const $foundItem = $(foundItem);
            const foundItemName = $foundItem.find("a.product-card__name").text().trim().replace(/\s+/g, ' ');
            const similarity = stringSimilarity.compareTwoStrings(itemName, foundItemName);

            if (similarity > highestSimilarity) {
                highestSimilarity = similarity;
                bestMatchItem = $foundItem;
            }
        }

        if (!bestMatchItem || highestSimilarity <= 0.01) {
            return { found: false, name: itemName, reason: 2 };
        }

        // Extract product details
        const bestMatchName = bestMatchItem.find("a.product-card__name").text().trim();
        const bestMatchImage = bestMatchItem.find("img.book-img-cover").attr('data-src');

        let imagePathName = null;
        if (bestMatchImage) {
            const imgUrl = bestMatchImage.startsWith('//') ? 'https:' + bestMatchImage : bestMatchImage;
            const imgPath = path.resolve(__dirname, '../images/erichkrause/', `${productId}.jpg`);
            // await downloadImage(imgUrl, imgPath);
            imagePathName = `/images/erichkrause/${productId}.jpg`;
        }

        return { found: true, name: bestMatchName, imagePathName };

    } catch (error) {
        console.error("Error parsing product:", error);
        return { found: false, name: itemName, reason: -1 };
    }
}
parseProduct_erichkrause('Ballpoint pen ErichKrause R-301 Classic Stick 1.0, ink color: blue (box 50 pcs.)', 1)


http.listen(port, function () {
    console.log('tirgo server listening on port ' + port);
});
