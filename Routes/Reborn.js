const
    express = require('express'),
    reborn = express.Router(),
    database = require('../Database/database'),
    cors = require('cors'),
    fs = require('fs');

reborn.use(cors());

reborn.post('/getAllDrivers', async (req, res) => {
    let connect,
        from = +req.body.from,
        limit = +req.body.limit,
        id = req.body.id ? req.body.id:'',
        phone = req.body.phone ? req.body.phone:'',
        indentificator = req.body.indentificator ? req.body.indentificator:'',
        typetransport = req.body.typetransport ? req.body.typetransport:'',
        name = req.body.name ? req.body.name:'',
        dateReg = req.body.dateReg ? req.body.dateReg:'',
        dateLogin = req.body.dateLogin ? req.body.dateLogin:'',
        [rows] = [],
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        if (!typetransport){
            [rows] = await connect.query('SELECT * FROM users_list WHERE user_type = 1 AND id LIKE ? AND IFNULL(name, ?) LIKE ? AND IFNULL(phone, ?) LIKE ? AND IFNULL(date_reg, ?) LIKE ? AND IFNULL(date_last_login, ?) LIKE ? AND IFNULL(iso_code, ?) LIKE ?  ORDER BY id DESC LIMIT ?, ?',
                [id ? id:'%','',name ? '%'+name+'%':'%','',phone ? '%'+phone+'%':'%','',dateReg ? '%'+dateReg+'%':'%','',dateLogin ? '%'+dateLogin+'%':'%','',indentificator ? '%'+indentificator+'%':'%',from,limit]);
        }else {
            [rows] = await connect.query('SELECT ul.* FROM users_transport ut LEFT JOIN users_list ul ON ul.id = ut.user_id WHERE ut.type = ? AND ul.user_type = 1 AND ul.id LIKE ? AND IFNULL(ul.name, ?) LIKE ? AND IFNULL(ul.phone, ?) LIKE ? AND IFNULL(ul.date_reg, ?) LIKE ? AND IFNULL(ul.date_last_login, ?) LIKE ? AND IFNULL(ul.iso_code, ?) LIKE ?  ORDER BY ul.id DESC LIMIT ?, ?',
                [+typetransport,id ? id:'%','',name ? '%'+name+'%':'%','',phone ? '%'+phone+'%':'%','',dateReg ? '%'+dateReg+'%':'%','',dateLogin ? '%'+dateLogin+'%':'%','',indentificator ? '%'+indentificator+'%':'%',from,limit]);
        }
        const [rows_count] = await connect.query('SELECT count(*) as allcount FROM users_list WHERE user_type = 1 ORDER BY id DESC');
        if (rows.length){
            appData.data_count = rows_count[0].allcount
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

reborn.post('/getUserInfo', async (req, res) => {
    let connect,
        id = req.body.id ? req.body.id:'',
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM users_list WHERE id = ? LIMIT 1',[id]);
        if (rows.length){
            appData.data = rows[0];
            appData.data.avatar = fs.existsSync(process.env.FILES_PATCH +'tirgo/drivers/'+rows[0].id+'/'+ rows[0].avatar)?process.env.SERVER_URL +'tirgo/drivers/'+rows[0].id+'/'+ rows[0].avatar : null;
            const [files] = await connect.query('SELECT * FROM users_list_files WHERE user_id = ?', [rows[0].id]);
            appData.data.files = await Promise.all(files.map(async (file) => {
                let newFile = file;
                newFile.preview = fs.existsSync(process.env.FILES_PATCH +'tirgo/drivers/'+rows[0].id+'/'+ file.name)?process.env.SERVER_URL +'tirgo/drivers/'+rows[0].id+'/'+ file.name : null;
                return newFile;
            }));
            const [trucks] = await connect.query('SELECT * FROM users_transport WHERE user_id = ?',[rows[0].id]);
            appData.data.trucks = await Promise.all(trucks.map(async (truck) => {
                const [filestruck] = await connect.query('SELECT * FROM users_transport_files WHERE transport_id = ?', [truck.id]);
                // console.log(filestruck)
                let newTruck = truck;
                newTruck.docks = await Promise.all(filestruck.map(async (filetruck) => {
                    let docks = filetruck;
                    docks.preview = fs.existsSync(process.env.FILES_PATCH +'tirgo/drivers/'+rows[0].id+'/'+ filetruck.name)?process.env.SERVER_URL +'tirgo/drivers/'+rows[0].id+'/'+ filetruck.name : null;
                    // console.log(docks, process.env.FILES_PATCH)
                    return docks;
                }))
                // console.log(newTruck)
                return newTruck;
            }));
            console.log(appData.data)
            const [orders] = await connect.query('SELECT * FROM orders_accepted oa LEFT JOIN orders o ON oa.order_id = o.id WHERE oa.user_id = ?', [rows[0].id]);
            appData.data.orders = orders;
            const [contacts] = await connect.query('SELECT * FROM users_contacts WHERE user_id = ?', [rows[0].id]);
            appData.data.contacts = contacts;
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
reborn.post('/getAllTrackingDrivers', async (req, res) => {
    let connect,
        id = req.body.id ? req.body.id:'',
        phone = req.body.phone ? req.body.phone:'',
        indentificator = req.body.indentificator ? req.body.indentificator:'',
        typetransport = req.body.typetransport ? req.body.typetransport:'',
        name = req.body.name ? req.body.name:'',
        status = req.body.status ? req.body.status:'',
        [rows] = [],
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        if (!typetransport){
            [rows] = await connect.query('SELECT * FROM users_list WHERE user_type = 1 AND id LIKE ? AND IFNULL(name, ?) LIKE ? AND IFNULL(phone, ?) LIKE ? AND IFNULL(iso_code, ?) LIKE ? AND status LIKE ? AND lat is not null ORDER BY id DESC',
                [id ? id:'%','',name ? '%'+name+'%':'%','',phone ? '%'+phone+'%':'%','',indentificator ? '%'+indentificator+'%':'%',status ? '%'+status+'%':'%']);
        }else {
            [rows] = await connect.query('SELECT ul.* FROM users_transport ut LEFT JOIN users_list ul ON ul.id = ut.user_id WHERE ut.type = ? AND ul.user_type = 1 AND ul.id LIKE ? AND IFNULL(ul.name, ?) LIKE ? AND IFNULL(ul.phone, ?) LIKE ? AND IFNULL(ul.iso_code, ?) LIKE ? AND status LIKE ? AND lat is not null ORDER BY ul.id DESC',
                [+typetransport,id ? id:'%','',name ? '%'+name+'%':'%','',phone ? '%'+phone+'%':'%','',indentificator ? '%'+indentificator+'%':'%',status ? '%'+status+'%':'%']);
        }
        if (rows.length){
            appData.data = rows;
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
reborn.post('/getAllUsers', async (req, res) => {
    let connect,
        from = +req.body.from,
        limit = +req.body.limit,
        id = req.body.id ? req.body.id:'',
        phone = req.body.phone ? req.body.phone:'',
        dateReg = req.body.dateReg ? req.body.dateReg:'',
        dateLogin = req.body.dateLogin ? req.body.dateLogin:'',
        name = req.body.name ? req.body.name:'',
        city = req.body.city ? req.body.city:'',
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM users_list WHERE user_type = 2 AND id LIKE ? AND IFNULL(name, ?) LIKE ? AND IFNULL(phone, ?) LIKE ? AND IFNULL(city, ?) LIKE ? AND IFNULL(date_reg, ?) LIKE ? AND IFNULL(date_last_login, ?) LIKE ? ORDER BY id LIMIT ?, ?',
            [id ? id:'%','',name ? '%'+name+'%':'%','',phone ? '%'+phone+'%':'%','',city ? '%'+city+'%':'%','',dateReg ? '%'+dateReg+'%':'%','',dateLogin ? '%'+dateLogin+'%':'%',from,limit]);
        const [rows_count] = await connect.query('SELECT count(*) as allcount FROM users_list WHERE user_type = 2 AND id LIKE ? ORDER BY id DESC',[id ? id:'%']);
        if (rows.length){
            appData.status = true;
            appData.data_count = rows_count[0].allcount
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
reborn.post('/getOrderInfo', async (req, res) => {
    let connect,
        id = req.body.id ? req.body.id:'',
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM orders WHERE id = ? LIMIT 1',[id]);
        if (rows.length){
            appData.data = rows[0];
            const [orders_accepted] = await connect.query('SELECT ul.*,oa.price as priceorder,oa.one_day,oa.two_day,oa.three_day,oa.status_order,oa.date_create as date_create_accepted FROM orders_accepted oa LEFT JOIN users_list ul ON ul.id = oa.user_id WHERE oa.order_id = ?',[rows[0].id]);
            appData.data.orders_accepted = await Promise.all(orders_accepted.map(async (item2) => {
                let newItemUsers = item2;
                newItemUsers.avatar = fs.existsSync(process.env.FILES_PATCH +'tirgo/drivers/'+item2.id+'/'+ item2.avatar)?process.env.SERVER_URL +'tirgo/drivers/'+item2.id+'/'+ item2.avatar : null;
                return newItemUsers;
            }));
            const [route] = await connect.query('SELECT * FROM routes WHERE id = ? LIMIT 1',[rows[0].route_id]);
            appData.data.route = route[0];
            const [userinfo] = await connect.query('SELECT * FROM users_list WHERE id = ? LIMIT 1',[rows[0].user_id]);
            appData.data.userinfo = userinfo[0];
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
reborn.post('/getAllOrders', async (req, res) => {
    let connect,
        id = req.body.id ? req.body.id:'',
        id_client = req.body.id_client ? req.body.id_client:'',
        from_city = req.body.from_city ? req.body.from_city:'',
        to_city = req.body.to_city ? req.body.to_city:'',
        status = req.body.status ? req.body.status:'',
        typecargo = req.body.typecargo ? req.body.typecargo:'',
        typetransport = req.body.typetransport ? req.body.typetransport:'',
        price = req.body.price ? req.body.price:'',
        dateCreate = req.body.dateCreate ? req.body.dateCreate:'',
        dateSend = req.body.dateSend ? req.body.dateSend:'',
        saveorder = req.body.saveorder ? +req.body.saveorder:null,
        from = +req.body.from,
        limit = +req.body.limit,
        appData = {status: false,timestamp: new Date().getTime()};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM orders WHERE id LIKE ? AND status LIKE ? AND IFNULL(user_id, ?) LIKE ? AND (transport_types LIKE ? OR transport_type LIKE ?) AND type_cargo LIKE ? AND IFNULL(price, ?) LIKE ? AND IFNULL(date_create, ?) LIKE ?  AND IFNULL(date_send, ?) LIKE ? AND secure_transaction LIKE ? ORDER BY id DESC LIMIT ?, ?',
            [id ? id:'%',status ? status:'%','',id_client ? '%'+id_client+'%':'%',typetransport ? '%'+typetransport+'%':'%',typetransport ? '%'+typetransport+'%':'%',typecargo ? '%'+typecargo+'%':'%','',price ? '%'+price+'%':'%','',dateCreate ? '%'+dateCreate+'%':'%','',dateSend ? '%'+dateSend+'%':'%',saveorder ? +saveorder:'%',from,limit]);
        const [rows_count] = await connect.query('SELECT count(*) as allcount FROM orders ORDER BY id DESC');
        if (rows.length){
            appData.data_count = rows_count[0].allcount
            appData.data = await Promise.all(rows.map(async (item) => {
                let newItem = item;
                newItem.transport_types = JSON.parse(item.transport_types);
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
            appData.error = 'Нет заказов';
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
reborn.post('/getDeletedUsers', async (req, res) => {
    let connect,
        from = +req.body.from,
        limit = +req.body.limit,
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM users_list WHERE deleted = 1 ORDER BY id DESC LIMIT ?, ?',[from,limit]);
        const [rows_count] = await connect.query('SELECT count(*) as allcount  FROM users_list WHERE deleted = 1 ORDER BY id DESC');
        if (rows.length){
            appData.status = true;
            appData.data_count = rows_count[0].allcount
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
reborn.post('/getActivityUsers', async (req, res) => {
    let connect,
        from = +req.body.from,
        limit = +req.body.limit,
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT ua.*,ul.name FROM users_activity ua LEFT JOIN users_list ul ON ul.id = ua.userid ORDER BY ua.date DESC LIMIT ?, ?',[from,limit]);
        const [rows_count] = await connect.query('SELECT count(*) as allcount FROM users_activity ORDER BY date DESC');
        if (rows.length){
            appData.data_count = rows_count[0].allcount
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
reborn.post('/generPasswordMerchant', async (req, res) => {
    let connect,
        id = +req.body.id,
        code = Math.floor(10000000 + Math.random() * 89999999),
        name = req.body.name,
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
        const [rows] = await connect.query('UPDATE users_list SET merch_login = ?,merch_password = ? WHERE id = ?',[name +''+ id,code.toString(), +id]);
        if (rows.affectedRows > 0) {
            appData.code = code;
            appData.name = name +''+ id;
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
module.exports = reborn;
