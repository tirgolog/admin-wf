const
    express = require('express'),
    admin = express.Router(),
    database = require('../Database/database'),
    cors = require('cors'),
    fs = require('fs'),
    push = require('../Modules/Push'),
    jwt = require('jsonwebtoken');
const crypto = require("crypto");
const socket = require("../Modules/Socket");

admin.use(cors());

admin.post('/loginAdmin', async (req, res) => {
    let connect,
        appData = {status: false},
        login = req.body.name,
        password = req.body.password;
    try {
        password = crypto.createHash('md5').update(password).digest('hex')
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM users_list WHERE username = ? AND password = ? AND user_type = 3 AND ban <> 1',[login,password]);
        if (rows.length){
            appData.status = true;
            await connect.query('UPDATE users_list SET date_last_login = ? WHERE id = ?',[new Date(),rows[0].id]);
            //appData.token = jwt.sign({id: rows[0].id, type_business: rows[0].type_business, type_user: rows[0].type_user,}, process.env.SECRET_KEY);
            appData.token = jwt.sign({id: rows[0].id, type_business: rows[0].type_business, type_user: rows[0].type_user,}, process.env.SECRET_KEY);
        }else {
            appData.error = 'Данные для входа введены неверно'
        }
        res.status(200).json(appData);
    } catch (err) {
        console.log(err)
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});

admin.use((req, res, next) => {
    let token = req.body.token || req.headers['token'] || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    let appData = {};
    if (token) {
        jwt.verify(token, process.env.SECRET_KEY, function(err) {
            if (err) {
                appData["error"] = err;
                appData["data"] = "Token is invalid";
                res.status(403).json(appData);
            } else {
                next();
            }
        });
    } else {
        appData["error"] = 1;
        appData["data"] = "Token is null";
        res.status(200).json(appData);
    }
});

admin.post('/getAllUsers', async (req, res) => {
    let connect,
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM users_list WHERE user_type = 2 ORDER BY id DESC');
        if (rows.length){
            appData.data = await Promise.all(rows.map(async (row) => {
                let newUser = row;
                newUser.avatar = fs.existsSync(process.env.FILES_PATCH +'tirgo/clients/'+row.id+'/'+ row.avatar)?process.env.SERVER_URL +'tirgo/clients/'+row.id+'/'+ row.avatar : null;
                const [contacts] = await connect.query('SELECT * FROM users_contacts WHERE user_id = ?', [row.id]);
                newUser.contacts = contacts;
                return newUser;
            }))
        }
        res.status(200).json(appData);
    } catch (e) {
        appData.error = e.message;
        res.status(400).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});

admin.post('/getAllDrivers', async (req, res) => {
    let connect,
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM users_list WHERE user_type = 1 ORDER BY id DESC');
        if (rows.length){
            appData.data = await Promise.all(rows.map(async (row) => {
                let newUser = row;
                newUser.avatar = fs.existsSync(process.env.FILES_PATCH +'tirgo/drivers/'+row.id+'/'+ row.avatar)?process.env.SERVER_URL +'tirgo/drivers/'+row.id+'/'+ row.avatar : null;
                const [files] = await connect.query('SELECT * FROM users_list_files WHERE user_id = ?', [row.id]);
                newUser.files = await Promise.all(files.map(async (file) => {
                    let newFile = file;
                    newFile.preview = fs.existsSync(process.env.FILES_PATCH +'tirgo/drivers/'+row.id+'/'+ file.name)?process.env.SERVER_URL +'tirgo/drivers/'+row.id+'/'+ file.name : null;
                    return newFile;
                }));
                const [trucks] = await connect.query('SELECT * FROM users_transport WHERE user_id = ?',[row.id]);
                newUser.trucks = await Promise.all(trucks.map(async (truck) => {
                    const [filestruck] = await connect.query('SELECT * FROM users_transport_files WHERE transport_id = ?', [truck.id]);
                    let newTruck = truck;
                    newTruck.docks = await Promise.all(filestruck.map(async (filetruck) => {
                        let docks = filetruck;
                        docks.preview = fs.existsSync(process.env.FILES_PATCH +'tirgo/drivers/'+row.id+'/'+ filetruck.name)?process.env.SERVER_URL +'tirgo/drivers/'+row.id+'/'+ filetruck.name : null;
                        return docks;
                    }))
                    return newTruck;
                }));
                const [orders] = await connect.query('SELECT * FROM orders_accepted oa LEFT JOIN orders o ON oa.order_id = o.id WHERE oa.user_id = ?', [row.id]);
                newUser.orders = orders;
                const [contacts] = await connect.query('SELECT * FROM users_contacts WHERE user_id = ?', [row.id]);
                newUser.contacts = contacts;
                return newUser;
            }))
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (e) {
        appData.error = e.message;
        res.status(400).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/acceptOrderDriver', async (req, res) => {
    let connect,
        appData = {status: false,timestamp: new Date().getTime()},
        orderid = req.body.orderid,
        price = req.body.price,
        userid = req.body.userid;
    try {
        connect = await database.connection.getConnection();

        const [isset] = await connect.query('SELECT *  FROM orders_accepted WHERE user_id = ? AND order_id = ?', [userid,orderid]);
        if (!isset.length){
            await connect.query('UPDATE orders SET status = 1 WHERE id = ?',[orderid]);
            const [rows] = await connect.query('INSERT INTO orders_accepted SET user_id = ?,order_id = ?,price = ?,status_order = 1', [userid,orderid,price]);
            if (rows.affectedRows){
                socket.updateAllList('update-all-list','1')
                appData.status = true;
            }else {
                appData.error = 'Невозможно применить водителя';
            }
        }else {
            appData.error = 'Данный водитель уже назначен ';
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/createOrder', async (req, res) => {
    console.log(req.body)
    let connect,
        appData = {status: false,timestamp: new Date().getTime()},
        data = req.body.data;
    try {
        console.log(data)
        connect = await database.connection.getConnection();
        const [routes] = await connect.query('SELECT * FROM routes WHERE from_city_id = ? AND to_city_id = ? LIMIT 1',[data.city_start_id,data.city_finish_id]);
        if (routes.length){
            const [rows] = await connect.query('INSERT INTO orders SET user_id = ?,price = ?,date_send = ?,add_two_days = ?,length_box = ?,width_box = ?,height_box = ?,transport_type = ?,weight = ?,type_cargo = ?,route_id = ?,no_cash = ?,adr = ?',
                [data.userid,data.price,new Date(data.date_start),data.add_two_days,data.length_box,data.width_box,data.height_box,data.typetransport,data.weight,data.typecargo,routes[0].id,data.no_cash ? data.no_cash:0,data.adr]);
            if (rows.affectedRows){
                appData.status = true;
                socket.updateAllList('update-all-list','1')
            }else {
                appData.error = 'Невозможно добавить заказ';
            }
        }else {
            const [routesadd] = await connect.query('INSERT INTO routes SET from_city_id = ?,from_city = ?, to_city_id = ?,to_city = ?,to_lat = ?,to_lng = ?,from_lat = ?,from_lng = ?',
                [data.city_start_id,data.city_start,data.city_finish_id,data.city_finish,data.finish_lat,data.finish_lng,data.start_lat,data.start_lng]);
            if (routesadd.affectedRows){
                const [rows] = await connect.query('INSERT INTO orders SET user_id = ?,price = ?,date_send = ?,add_two_days = ?,length_box = ?,width_box = ?,height_box = ?,transport_type = ?,weight = ?,type_cargo = ?,route_id = ?,no_cash = ?,adr = ?',
                    [data.userid,data.price,new Date(data.date_start),data.add_two_days,data.length_box,data.width_box,data.height_box,data.typetransport,data.weight,data.typecargo,routesadd.insertId,data.no_cash ? data.no_cash:0,data.adr]);
                if (rows.affectedRows){
                    appData.status = true;
                    socket.updateAllList('update-all-list','1')
                }else {
                    appData.error = 'Невозможно добавить заказ';
                }
            }

        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});

admin.post('/addUser', async (req, res) => {
    let connect,
        cityInfo = req.body.cityinfo,
        data = req.body.datauser,
        phone = '',
        appData = {status: false};
    try {
        console.log(cityInfo)
        console.log(data)
        connect = await database.connection.getConnection();
        phone = data.phone.replace(/[^0-9, ]/g,"").replace(/ /g,'');
        const [rows] = await connect.query('SELECT * FROM users_contacts WHERE text = ? AND verify = 1',[phone]);
        if (rows.length){
            appData.error = 'Пользователь уже зарегистрирован'
            appData.status = false;
        }else {
            const [insert] = await connect.query('INSERT INTO users_list SET country = ?,city = ?,geo_id = ?,iso_code = ?,city_lat = ?,city_lng = ?,phone = ?,user_type = 1,name = ?,birthday = ?,email = ?,date_last_login = NULL', [cityInfo.country,cityInfo.city ? cityInfo.city : cityInfo.region,cityInfo.geoname_id ? cityInfo.geoname_id : '0',cityInfo.country_iso_code,cityInfo.geo_lat,cityInfo.geo_lon,phone,data.name,new Date(data.birthday),data.email]);
            await connect.query('INSERT INTO users_contacts SET text=?,user_type = 1,user_id = ?,verify = 1', [phone,insert.insertId]);
            appData.id = insert.insertId;
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (e) {
        appData.error = e.message;
        res.status(400).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/createClient', async (req, res) => {
    console.log(req.body)
    let connect,
        appData = {status: false,timestamp: new Date().getTime()},
        name = req.body.name,
        phone = req.body.phone,
        email = req.body.email ? req.body.email:'',
        cityInfo = req.body.cityInfo;
    try {
        connect = await database.connection.getConnection();
        const [isset] = await connect.query('SELECT * FROM users_contacts WHERE text = ? AND verify = 1 LIMIT 1',[phone]);
        if (!isset.length){
            const [rows] = await connect.query('INSERT INTO users_list SET country = ?,city = ?,geo_id = ?,iso_code = ?,city_lat = ?,city_lng = ?,name = ?,phone = ?,user_type = 2,email = ?', [cityInfo.country,cityInfo.city,cityInfo.geoname_id,cityInfo.country_iso_code,cityInfo.geo_lat,cityInfo.geo_lon,name,phone,email]);
            if (rows.affectedRows) {
                await connect.query('INSERT INTO users_contacts SET type = ?,text = ?,user_id = ?,user_type = 2', ['phone',phone,rows.insertId]);
                appData.status = true;
            } else {
                appData.error = 'Что то пошло не так';
            }
        }else {
            appData.error = 'Такой пользователь уже зарегестрирован';
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/getAllAdmins', async (req, res) => {
    let connect,
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM users_list WHERE user_type = 3');
        if (rows.length){
            appData.data = rows
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (e) {
        appData.error = e.message;
        res.status(400).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/saveRole', async (req, res) => {
    let connect,
        id = req.body.id,
        data = req.body.data,
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        console.log(data)
        if (id !== 0){
            await connect.query('UPDATE role_user SET ? WHERE id = ?',[data,id]);
            appData.status = true;
        }else {
            await connect.query('INSERT INTO role_user SET ?',[data]);
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (e) {
        appData.error = e.message;
        res.status(400).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/addAdmin', async (req, res) => {
    let connect,
        phone = req.body.phone,
        name = req.body.name,
        username = req.body.username,
        role = req.body.role,
        password = req.body.password,
        editaid = req.body.editaid ? req.body.editaid : 0 ,
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        password = password !== '' ? crypto.createHash('md5').update(password).digest('hex'):'';
        if (editaid>0){
            if (password === ''){
                const [edit] = await connect.query('UPDATE users_list SET phone = ?,name = ?,username = ?,role = ?,user_type = ? WHERE id = ?',[phone,name,username,role,3,editaid]);
                if (edit.affectedRows){
                    appData.status = true;
                }
            }else {
                const [edit] = await connect.query('UPDATE users_list SET phone = ?,name = ?,username = ?,role = ?,password = ?,user_type = ? WHERE id = ?',[phone,name,username,role,password,3,editaid]);
                if (edit.affectedRows){
                    appData.status = true;
                }
            }
        }else {
            const [rows] = await connect.query('INSERT INTO users_list SET phone = ?,name = ?,username = ?,role = ?,password = ?,user_type = ?',[phone,name,username,role,password,3]);
            if (rows.affectedRows){
                appData.status = true;
            }
        }
        res.status(200).json(appData);
    } catch (e) {
        appData.error = e.message;
        res.status(400).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/getAllRoles', async (req, res) => {
    let connect,
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM role_user');
        if (rows.length){
            appData.data = rows
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (e) {
        appData.error = e.message;
        res.status(400).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/closeOrder', async (req, res) => {
    let connect,
        orderid = req.body.orderid,
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('UPDATE orders SET status = 3 WHERE id = ?',[orderid]);
        if (rows.affectedRows){
            appData.data = rows
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (e) {
        appData.error = e.message;
        res.status(400).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/endOrder', async (req, res) => {
    let connect,
        orderid = req.body.orderid,
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('UPDATE orders SET status = 3 WHERE id = ?',[orderid]);
        if (rows.affectedRows){
            appData.data = rows
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (e) {
        appData.error = e.message;
        res.status(400).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/getActivityUsers', async (req, res) => {
    let connect,
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT ua.*,ul.name FROM users_activity ua LEFT JOIN users_list ul ON ul.id = ua.userid ORDER BY ua.date DESC');
        if (rows.length){
            appData.data = rows
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (e) {
        appData.error = e.message;
        res.status(400).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/getSecureTrans', async (req, res) => {
    let connect,
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM secure_transaction ORDER BY date DESC');
        if (rows.length){
            appData.data = rows
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (e) {
        appData.error = e.message;
        res.status(400).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/getTransactionsType', async (req, res) => {
    let connect,
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM transactions_type ORDER BY id DESC');
        if (rows.length){
            appData.data = rows
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (e) {
        appData.error = e.message;
        res.status(400).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/addTransportToUser', async (req, res) => {
    console.log('addTransportToUser')
    let connect,
        appData = {status: false,timestamp: new Date().getTime()},
        name = req.body.data.name,
        description = req.body.data.description,
        maxweight = req.body.data.maxweight,
        type = req.body.data.type,
        //car_photos = req.body.car_photos,
        //license_files = req.body.license_files,
        //tech_passport_files = req.body.tech_passport_files,
        cubature = req.body.data.cubature,
        state_number = req.body.data.state_number,
        adr = req.body.data.adr,
        userid = req.body.data.userid;
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('INSERT INTO users_transport SET name = ?,description = ?,type = ?,max_weight = ?,user_id = ?,adr = ?,cubature = ?,state_number = ?', [name,description,type,maxweight,userid,adr,cubature,state_number]);
        if (rows.affectedRows){
            appData.status = true;
            /*for (let car of car_photos){
                await connect.query('INSERT INTO users_transport_files SET transport_id = ?,file_patch = ?,name = ?,type_file = ?', [rows.insertId,car.preview,car.filename,'car_photos']);
            }
            for (let lic of license_files){
                await connect.query('INSERT INTO users_transport_files SET transport_id = ?,file_patch = ?,name = ?,type_file = ?', [rows.insertId,lic.preview,lic.filename,'license_files']);
            }
            for (let tech of tech_passport_files){
                await connect.query('INSERT INTO users_transport_files SET transport_id = ?,file_patch = ?,name = ?,type_file = ?', [rows.insertId,tech.preview,tech.filename,'tech_passport_files']);
            }*/
        }else {
            appData.error = 'Не получилось добавить транспорт. Попробуйте позже.';
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});

admin.post('/getAllOrders', async (req, res) => {
    let connect,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM orders ORDER BY id DESC ');
        if (rows.length){
            appData.data = await Promise.all(rows.map(async (item) => {
                let newItem = item;
                const [orders_accepted] = await connect.query('SELECT ul.*,oa.price as priceorder,oa.one_day,oa.two_day,oa.three_day,oa.status_order,oa.date_create as date_create_accepted FROM orders_accepted oa LEFT JOIN users_list ul ON ul.id = oa.user_id WHERE oa.order_id = ?',[item.id]);
                newItem.orders_accepted = await Promise.all(orders_accepted.map(async (item2) => {
                    let newItemUsers = item2;
                    newItemUsers.avatar = fs.existsSync(process.env.FILES_PATCH +'tirgo/drivers/'+item2.id+'/'+ item2.avatar)?process.env.SERVER_URL +'tirgo/drivers/'+item2.id+'/'+ item2.avatar : null;
                    return newItemUsers;
                }));
                const [route] = await connect.query('SELECT * FROM routes WHERE id = ? LIMIT 1',[item.route_id]);
                newItem.route = route[0];
                const [userinfo] = await connect.query('SELECT * FROM users_list WHERE id = ? LIMIT 1',[item.user_id]);
                newItem.userinfo = userinfo[0];
                return newItem;
            }));
            appData.status = true;
        }else {
            appData.error = 'Нет типов транспорта';
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.get('/getTypeTruck', async (req, res) => {
    let connect,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM trailer_type');
        if (rows.length){
            appData.data = rows;
            appData.status = true;
        }else {
            appData.error = 'Нет типов транспорта';
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.get('/getTypeCargo', async (req, res) => {
    let connect,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM type_cargo');
        if (rows.length){
            appData.data = rows;
            appData.status = true;
        }else {
            appData.error = 'Нет типов транспорта';
        }
        res.status(200).json(appData);
    } catch (err) {
        console.log(err)
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.get('/getAllMessages', async (req, res) => {
    let connect,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT *,ul.avatar,ul.name as username FROM chat_support cs LEFT JOIN users_list ul ON ul.id = cs.user_id GROUP BY cs.user_id');
        if (rows.length){
            appData.data = await Promise.all(rows.map(async (item) => {
                let newItem = item;
                newItem.avatar = fs.existsSync(process.env.FILES_PATCH +'tirgo/drivers/'+item.user_id+'/'+ item.avatar)?process.env.SERVER_URL +'tirgo/drivers/'+item.user_id+'/'+ item.avatar : null;
                const [messages] = await connect.query('SELECT * FROM chat_support WHERE user_id = ? ORDER BY id',[item.id]);
                newItem.messages = messages;
                return newItem;
            }))
            appData.status = true;
        }else {
            appData.error = 'Нет типов транспорта';
        }
        res.status(200).json(appData);
    } catch (err) {
        console.log(err)
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/saveUser', async (req, res) => {
    let connect,
        data = req.body.data,
        id = req.body.id,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('UPDATE users_list SET passport_series_numbers = ?,passport_date = ?,driver_license = ? WHERE id = ?',
            [data.passport_series_numbers,new Date(data.passport_date),data.driver_license,id]);
        if (rows.affectedRows){
            appData.data = rows;
            appData.status = true;
        }else {
            appData.error = 'Нет типов транспорта';
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/saveUserInfo', async (req, res) => {
    let connect,
        name = req.body.name,
        birthday = req.body.birthday,
        country = req.body.country,
        city = req.body.city,
        id = req.body.id,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('UPDATE users_list SET name = ?,birthday = ?,country = ?,city = ? WHERE id = ?',
            [name,new Date(birthday),country,city,id]);
        if (rows.affectedRows){
            appData.data = rows;
            appData.status = true;
        }else {
            appData.error = 'Нет типов транспорта';
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/savePassportUser', async (req, res) => {
    let connect,
        passport = req.body.passport,
        passportdate = req.body.passportdate,
        id = req.body.id,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('UPDATE users_list SET passport_series_numbers = ?,passport_date = ? WHERE id = ?',
            [passport,new Date(passportdate),id]);
        if (rows.affectedRows){
            appData.data = rows;
            appData.status = true;
        }else {
            appData.error = 'Нет типов транспорта';
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/saveNewMerchantId', async (req, res) => {
    let connect,
        merchid = req.body.merchid,
        id = req.body.id,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [isset] = await connect.query('SELECT * FROM users_list WHERE merch_login IS NOT NULL AND merch_password IS NOT NULL AND id = ? ',[merchid]);
        if (isset.length){
            const [rows] = await connect.query('UPDATE users_list SET merch_id = ? WHERE id = ?',
                [merchid,id]);
            if (rows.affectedRows){
                appData.data = rows;
                appData.status = true;
            }else {
                appData.error = 'Нет типов транспорта';
            }
        }else {
            appData.error = 'Нет такого мерчанта';
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/saveDriverLicenseUser', async (req, res) => {
    let connect,
        license = req.body.license,
        id = req.body.id,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('UPDATE users_list SET driver_license = ? WHERE id = ?',
            [license,id]);
        if (rows.affectedRows){
            appData.data = rows;
            appData.status = true;
        }else {
            appData.error = 'Нет типов транспорта';
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/deleteUser', async (req, res) => {
    let connect,
        id = req.body.id,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('UPDATE users_list SET deleted = 1 WHERE id = ?',
            [id]);
        if (rows.affectedRows){
            appData.data = rows;
            appData.status = true;
        }else {
            appData.error = 'Нет типов транспорта';
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/delDirty', async (req, res) => {
    let connect,
        id = req.body.id,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('UPDATE users_list SET dirty = 0 WHERE id = ?', [id]);
        if (rows.affectedRows){
            appData.data = rows;
            appData.status = true;
        }else {
            appData.error = 'Нет типов транспорта';
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/modarateUser', async (req, res) => {
    let connect,
        id = req.body.id,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('UPDATE users_list SET moderation = 1 WHERE id = ?', [id]);
        if (rows.affectedRows){
            appData.data = rows;
            appData.status = true;
        }else {
            appData.error = 'Что то пошло не так';
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/returnUser', async (req, res) => {
    let connect,
        id = req.body.id,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('UPDATE users_list SET deleted = 0 WHERE id = ?',
            [id]);
        if (rows.affectedRows){
            appData.data = rows;
            appData.status = true;
        }else {
            appData.error = 'Нет типов транспорта';
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/sendMessageSupport', async (req, res) => {
    let connect,
        userInfo = jwt.decode(req.headers.authorization.split(' ')[1]),
        message = req.body.message,
        id = req.body.id,
        data = {},
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        console.log(req.body)
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('INSERT INTO chat_support SET text = ?, user_id = ?,type = ?,user_admin_id = ?',[message,id,'text',userInfo.id]);
        if (rows.affectedRows){
            data.id = rows.insertId
            data.user_id = userInfo.id
            data.user_admin_id = null
            data.text = message
            data.type = 'text'
            data.status = 0
            data.date = new Date()
            appData.data = data
            appData.status = true;
        }
        socket.updateAllMessages('update-all-messages','1')
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.get('/checkSessionAdmin', async function(req, res) {
    let connect,
        userInfo = jwt.decode(req.headers.authorization.split(' ')[1]),
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM users_list WHERE id = ? AND user_type = 3 AND ban <> 1', [userInfo.id]);
        if (rows.length) {
            appData.user = rows[0];
            appData.status = true;
            res.status(200).json(appData);
        } else {
            res.status(200).json(appData);
        }
    } catch (err) {
        console.log(err)
        appData.status = false;
        appData.error = err;
        appData.message = err.message;
        appData.data = "Неизвестная ошибка2";
        res.status(200).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/addTypeCargo', async (req, res) => {
    let connect,
        userInfo = jwt.decode(req.headers.authorization.split(' ')[1]),
        type = req.body.type,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('INSERT INTO type_cargo SET name = ?,admin_id = ?',[type,userInfo.id]);
        if (rows.affectedRows){
            appData.id = rows.insertId;
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/addPayment', async (req, res) => {
    let connect,
        userInfo = jwt.decode(req.headers.authorization.split(' ')[1]),
        type = req.body.type,
        description = req.body.description,
        amount = req.body.amount,
        id = req.body.id,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('INSERT INTO transactions SET description = ?,type = ?,user_id = ?,user_id_admin = ?,amount = ?',[description,type,id,userInfo.id,amount]);
        if (rows.affectedRows){
            const [client] = await connect.query('SELECT * FROM users_list WHERE token <> ? AND token is NOT NULL AND id = ?', ['',id]);
            if (client.length){
                push.send(client[0].token, 'Пополнение баланса','Ваш баланс пополнен на ' + amount ,'','');
            }
            await connect.query('UPDATE users_list SET balance = balance + ? WHERE id = ?',[amount,id]);
            appData.id = rows.insertId;
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/bannedAdmin', async (req, res) => {
    console.log(req.body)
    let connect,
        id = req.body.userid,
        banned = req.body.banned,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('UPDATE users_list SET ban = ? WHERE id = ?',[banned,id]);
        if (rows.affectedRows){
            socket.logOutUser('log-out-user',id)
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
admin.post('/addTypeCar', async (req, res) => {
    let connect,
        userInfo = jwt.decode(req.headers.authorization.split(' ')[1]),
        data = req.body.data,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('INSERT INTO trailer_type SET ?',[data]);
        if (rows.affectedRows){
            appData.id = rows.insertId;
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (err) {
        appData.status = false;
        appData.error = err;
        res.status(403).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});
module.exports = admin;