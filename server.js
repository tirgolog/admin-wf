const app = require('express')();
const fs = require('fs');
const path = require('path');
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const cors = require('cors');
const bodyParser = require('body-parser');
const socket = require('./Modules/Socket');
const Users = require('./Routes/Users');
const Api = require('./Routes/Api');
const Admin = require('./Routes/Admin');
const Reborn = require('./Routes/Reborn');
const Merchant = require('./Routes/Merchant');
const port = 7790;

app.use(cors());

process.env.SECRET_KEY = "tirgoserverkey";
process.env.FILES_PATCH = "/var/www/html/";
process.env.SERVER_URL = "https://tirgo.io/";
app.get('/', function(req, res){
    res.send('<h1>tirgo glad you!!!</h1>');
});
// const corsOptions = {
//     origin: '*', // Replace with the address of your Ionic app
//     methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
//     credentials: true,
//     optionsSuccessStatus: 204,
//     preflightContinue: true, // Handle preflight requests
// };
// app.options('*', cors(corsOptions));
// app.use(cors(corsOptions));

// // Enable CORS for all routes
// app.use((req, res, next) => {
//     res.header('Access-Control-Allow-Origin', '*'); // Replace with your Ionic app's address
//     res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
//     res.header('Access-Control-Allow-Headers', 'Content-Type');
//     next();
//   });
// app.use(bodyParser.json({limit: '150mb'}));
// app.use(bodyParser.urlencoded({
//     extended: true
// }));
http.on('request', (req, res) => {
    //console.log(req)
});
app.get('/download/:filename', (req, res) => {
    console.log('/downloadImage')
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
app.use('/api', Api);
app.use('/admin', Admin);
app.use('/reborn', Reborn);
app.use('/merchant', Merchant);
socket.init(io);
http.on('listening',function(){
    console.log('ok, server is running');
});
http.listen(port, function(){
    console.log('tirgo server listening on port ' + port);
});
