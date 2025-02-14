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

http.listen(port, function () {
    console.log('tirgo server listening on port ' + port);
});
