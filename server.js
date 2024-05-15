const Minio = require("minio");
const Push = require('./Modules/Push');
require('./Routes/bot');
// require('./Routes/service-bot');
const
    app = require('express')(),
    fs = require('fs'),
    path = require('path'),
    jwt = require("jsonwebtoken"),
    // options = {
    //     key: fs.readFileSync('private.key'),
    //     cert: fs.readFileSync('certificate.crt'),
    //     ca: fs.readFileSync('ca_bundle.crt'),
    //     requestCert: true,
    //     rejectUnauthorized: false
    // },
    http = require('http').createServer(app),
    io = require('socket.io')(http, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    }),
    cors = require('cors'),
    bodyParser = require('body-parser'),
    socket = require('./Modules/Socket'),
    Users = require('./Routes/Users'),
    Payme = require('./Routes/Payme.js'),
    Admin = require('./Routes/Admin'),
    Reborn = require('./Routes/Reborn'),
    Merchant = require('./Routes/Merchant'),
    port = 7790;

process.env.SECRET_KEY = "tirgoserverkey";
process.env.FILES_PATCH = "/var/www/html/";
process.env.SERVER_URL = "https://tirgo.io/";

//Beeline
//AWS
// const minioClient = new Minio.Client({
//     endPoint: "13.232.83.179",
//     port: 9000,
//     useSSL: false,
//     accessKey: "2ByR3PpFGckilG4fhSaJ",
//     secretKey: "8UH4HtIBc7WCwgCVshcxmQslHFyJB8Y79Bauq5Xd",
// });

// minioClient.bucketExists("tirgo", function (error) {
//     if (error) {
//         return console.log(error);
//     }
// });
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
// const token = jwt.sign({id: 6650}, process.env.SECRET_KEY, { expiresIn: '20m' });
// console.log(token)
app.use(cors());
app.options('*', cors());
// app.use(cors());
// // Enable CORS for all routes
// app.use((req, res, next) => {
//     res.header('Access-Control-Allow-Origin', '*'); // Replace with your Ionic app's address
//     res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
//     res.header('Access-Control-Allow-Headers', 'Content-Type');
//     next(); 
// });
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
