const
    express = require('express'),
    reborn = express.Router(),
    database = require('../Database/database'),
    cors = require('cors'),
    fs = require('fs');
    const axios = require("axios");

reborn.use(cors());

reborn.post('/getAllDrivers', async (req, res) => {
    let connect,
        id = req.body.id ? req.body.id:'',
        from = +req.body.from ? +req.body.from : 0,
        limit = +req.body.limit ? +req.body.limit : 10,
        phone = req.body.phone ? req.body.phone.toString().replace('+', ''):'',
        indentificator = req.body.indentificator ? req.body.indentificator:'',
        typetransport = req.body.typetransport ? req.body.typetransport:'',
        name = req.body.name ? req.body.name:'',
        transport_number = req.body.transport_number,
        dateReg = req.body.dateReg ? req.body.dateReg:'',
        dateLogin = req.body.dateLogin ? req.body.dateLogin:'',
        subscription = req.body.subscription ? req.body.subscription:'',
        isSubscribed = req.body.is_subscribed,
        paid_way_kz = req.body.paid_way_kz,
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();

            let query = `SELECT 
                (@driverindex := @driverindex - 1) AS descending_count,
                ul.* 
                FROM users_list ul
                WHERE ul.user_type = 1`;

            // Add conditions based on filters
            let queryFilter = '';
            
            if (id) {
                queryFilter += ` AND ul.id = '${id}'`;
            }

            if (paid_way_kz) {
                queryFilter += ` AND ul.paid_way_kz = ${paid_way_kz}`;
            }

            if (phone) {
                queryFilter += ` AND ul.phone = '${phone}'`;
            }

            if(indentificator) {
                queryFilter += ` AND ul.iso_code = '${indentificator}'`;
            }

            if(typetransport) {
                queryFilter += ` AND ut.type = '${typetransport}'`;
            }

            if(name) {
                queryFilter += ` AND ul.name = '%${name}%'`;
            }

            if(dateReg) {
                queryFilter += ` AND ul.date_reg = '${dateReg}'`;
            }
            
            if(dateLogin) {
                queryFilter += ` AND ul.date_last_login = '${dateLogin}'`;
            }

            // Check if transportType parameter is provided
            if (typetransport) {
                // Add the transportType filter to the query filter string
                queryFilter += ` AND EXISTS (
                                    SELECT 1
                                    FROM users_transport ut
                                    WHERE ut.user_id = ul.id
                                    AND ut.transport_type = '${typetransport}'
                                )`;
            }

            if(subscription) {
                queryFilter += ` AND ul.subscription_id IS NOT NULL`;
            }

              // Optional filter for is_subscribe
            if (isSubscribed) {
                queryFilter += ` AND to_subscription > CURDATE()
                                AND from_subscription IS NOT NULL
                                AND to_subscription IS NOT NULL`;
            }
            // console.log(query + queryFilter)
            
            let queryCount = `SELECT 
            COUNT(ul.id) as count
            FROM users_list ul
            WHERE ul.user_type = 1` + queryFilter;
            
            const [row] = await connect.query(queryCount);

            //set pagination after getting count
            queryFilter += ` ORDER BY ul.id DESC LIMIT ${from}, ${limit};`
            await connect.query(`SET @driverindex := ${row[0]?.count - from}`);
            const [rows] = await connect.query(`
            ${query + queryFilter}
            `);

        if (rows.length){
            appData.data_count = row[0]?.count
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
            if(transport_number) {
                appData.data = appData.data.filter((el) => el.trucks?.length && el?.trucks.some((tr) => tr.transport_number == transport_number));
            }
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (e) {
        console.log(e)
        appData.error = e.message;
        res.status(400).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});


reborn.post('/getAllDriversList', async (req, res) => {
    let connect,
        id = req.body.id ? req.body.id:'',
        appData = {status: false};
    try {
        connect = await database.connection.getConnection();
       [rows] = await connect.query('SELECT id, phone, username FROM users_list WHERE user_type = 1 AND id LIKE ? ORDER BY id',
        [id ? id:'%']);
        if (rows.length){
            appData.data = rows
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (e) {
        console.log(e)
        appData.error = e.message;
        res.status(400).json(appData);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});

reborn.get('/driver/orders', async (req, res) => {
    let connect,
        id = req.query.id,
        appData = {status: false};
        if(!id) {
            appData.error = 'Id is required';
            res.status(400).json(appData);
        }
    try {
        connect = await database.connection.getConnection();
       [rows] = await connect.query('SELECT * from orders WHERE driver_id = ?',
        [id]);
        if (rows.length){
            appData.data = rows
            appData.status = true;
        }
        res.status(200).json(appData);
    } catch (e) {
        console.log(e)
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
                newFile.filename = file.name;
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
            appData.data = await Promise.all(rows.map(async (row) => {
                let newUser = row;
                const [truck_types] = await connect.query('SELECT type FROM users_transport WHERE user_id = ?',[row.id]);
                newUser.truck_types = truck_types;
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
        console.log('Error while getting all trecking drivers: ', e)
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
        const [rows] = await connect.query(`
        WITH TotalCount AS (
            SELECT COUNT(*) AS total_count FROM users_list where user_type = 2
        ),
        RankedUsers AS (
            SELECT *,
                   ROW_NUMBER() OVER (ORDER BY id DESC) AS row_num
            FROM users_list
            WHERE user_type = 2 
              AND id LIKE ? 
              AND IFNULL(name, ?) LIKE ? 
              AND IFNULL(phone, ?) LIKE ? 
              AND IFNULL(city, ?) LIKE ? 
              AND IFNULL(date_reg, ?) LIKE ? 
              AND IFNULL(date_last_login, ?) LIKE ? 
        )
        SELECT (TotalCount.total_count - RankedUsers.row_num )+ 1 AS descending_count, TotalCount.total_count, RankedUsers.*
        FROM RankedUsers
        CROSS JOIN TotalCount
        ORDER BY RankedUsers.id DESC
        LIMIT ?, ?
         `,
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
        merchantData = [],
        appData = {status: false,timestamp: new Date().getTime()};
    try {

        const merchantCargos = await axios.get(
            "https://merchant.tirgo.io/api/v1/cargo/all-admin?secure="+saveorder
          );
          if (merchantCargos.data.success) {
            merchantData = merchantCargos.data.data.map((el) => {
              return {
                id: el.id,
                isMerchant: true,
                usernameorder: el.createdBy?.username,
                userphoneorder: el.createdBy?.phoneNumber,
                route: {
                  from_city: el.sendLocation,
                  to_city: el.cargoDeliveryLocation,
                },
                add_two_days: "",
                adr: el.isDangrousCargo,
                comment: "",
                comment_client: "",
                cubic: "",
                currency: el.currency?.name,
                date_create: new Date(el.createdAt),
                date_send: el.sendCargoDate,
                driver_id: el.driverId,
                end_client: "",
                end_date: "",
                end_driver: "",
                height_box: el.cargoHeight,
                length_box: el.cargoLength,
                loading: "",
                mode: "",
                no_cash: el.isCashlessPayment,
                orders_accepted: el.acceptedOrders,
                price: el.offeredPrice,
                raiting_driver: "",
                raiting_user: "",
                route_id: "",
                save_order: "",
                secure_transaction: el.isSafe,
                status: el.status,
                transport_type: el.transportType?.name,
                transport_types: el.transportTypes,
                type_cargo: el.cargoType?.code,
                user_id: el.clientId,
                weight: el.cargoWeight,
                width_box: el.cargoWidth,
                created_at: new Date(el.createdAt),
                logo: el.merchant?.logoFilePath,
                merchant: el.merchant
              };
            });
          }

        connect = await database.connection.getConnection();
        const [rows] = await connect.query('SELECT * FROM orders WHERE id LIKE ? AND status LIKE ? AND IFNULL(user_id, ?) LIKE ? AND (transport_types LIKE ? OR transport_type LIKE ?) AND type_cargo LIKE ? AND IFNULL(price, ?) LIKE ? AND IFNULL(date_create, ?) LIKE ?  AND IFNULL(date_send, ?) LIKE ?  ORDER BY id DESC LIMIT ?, ?',
            [id ? id:'%',status ? status:'%','',id_client ? '%'+id_client+'%':'%',typetransport ? '%'+typetransport+'%':'%',typetransport ? '%'+typetransport+'%':'%',typecargo ? '%'+typecargo+'%':'%','',price ? '%'+price+'%':'%','',dateCreate ? '%'+dateCreate+'%':'%','',dateSend ? '%'+dateSend+'%':'%',from,limit]);
        const [rows_count] = await connect.query('SELECT count(*) as allcount FROM orders ORDER BY id DESC');
        if (rows.length){
            appData.data_count = rows_count[0].allcount
            let data;
            if(saveorder) {
                data = [...merchantData];
            } else {
                data = [...merchantData ,...rows];
            }
            data.sort((a,b) => {
                if (a.date_create < b.date_create) {
                    return 1;
                  }
                  if (a.date_create > b.date_create) {
                    return -1;
                  }
                  return 0;
            })
            appData.data = await Promise.all(data.map(async (item) => {
                let newItem = item;
                if (!item.isMerchant) {
                    newItem.transport_types = JSON.parse(item.transport_types);
                  }
                const [orders_accepted] = await connect.query('SELECT ul.*,oa.price as priceorder,oa.one_day,oa.two_day,oa.three_day,oa.status_order,oa.date_create as date_create_accepted FROM orders_accepted oa LEFT JOIN users_list ul ON ul.id = oa.user_id WHERE oa.order_id = ?',[item.isMerchant ? +item.id.split("M")[1] : item.id]);
                newItem.orders_accepted = await Promise.all(orders_accepted.map(async (item2) => {
                    let newItemUsers = item2;
                    newItemUsers.avatar = null;
                    return newItemUsers;
                }));
                if (!item.isMerchant) {
                    const [route] = await connect.query(
                      "SELECT * FROM routes WHERE id = ? LIMIT 1",
                      [item.route_id]
                    );
                    newItem.route = route[0];
                  }
                  if (!item.isMerchant) {
                    const [userinfo] = await connect.query('SELECT * FROM users_list WHERE id = ? LIMIT 1',[item.user_id]);
                    newItem.userinfo = userinfo[0];
                  }
                return newItem;
            }
            ));
            appData.status = true;
        }else {
            appData.error = 'Нет заказов';
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

reborn.post('/getAllTmcOrders', async (req, res) => {
    let connect,
        id = req.body.id ? req.body.id:'',
        sendCargoDate = req.body.sendCargoDate ? req.body.sendCargoDate:'',
        status = req.body.status ? req.body.status:'',
        sendLocation = req.body.sendLocation ? req.body.sendLocation:'',
        cargoDeliveryLocation = req.body.cargoDeliveryLocation ? req.body.cargoDeliveryLocation:'',
        isSafeOrder = req.body.isSafeOrder ? req.body.isSafeOrder:'',
        from = +req.body.from,
        limit = +req.body.limit,
        appData = {status: false,timestamp: new Date().getTime()};
    try {

        if(!from) {
            from = 0;
        } 
        if(!limit) {
            limit = 10;
        }
        let filter = '';
        if(sendCargoDate) {
            if(filter.length) {
                filter += `&sendCargoDate=${sendCargoDate}`;
            } else {
                filter += `?sendCargoDate=${sendCargoDate}`;    
            } 
        }
        if(status != undefined && status != '') {
            if(filter.length) {
                filter += `&status=${status}`;
            } else {
                filter += `?status=${status}`;    
            } 
        }
        if(sendLocation) {
            if(filter.length) {
                filter += `&sendLocation=${sendLocation}`;
            } else {
                filter += `?sendLocation=${sendLocation}`;    
            } 
        }
        if(cargoDeliveryLocation) {
            if(filter.length) {
                filter += `&cargoDeliveryLocation=${cargoDeliveryLocation}`;
            } else {
                filter += `?cargoDeliveryLocation=${cargoDeliveryLocation}`;    
            }   
        }
        if(isSafeOrder) {
            if(filter.length) {
                filter += `&isSafeOrder=${isSafeOrder}`;
            } else {
                filter += `?isSafeOrder=${isSafeOrder}`;    
            } 
        }
        if(id) {
            if(filter.length) {
                filter += `&id=${id}`;
            } else {
                filter += `?id=${id}`;    
            }
        }
        if(from && limit) {
            if(filter.length) {
                filter += `&from=${from}&limit=${limit}`;
            } else {
                filter += `?from=${from}&limit=${limit}`;    
            }
        }
        const merchantCargos = await axios.get(
            `https://merchant.tirgo.io/api/v1/cargo/all-admin${filter}`
          );
          if (merchantCargos.data.success) {
            merchantData = merchantCargos.data.data.map((el) => {
              return {
                id: el.id,
                isMerchant: true,
                usernameorder: el.createdBy?.username,
                userphoneorder: el.createdBy?.phoneNumber,
                route: {
                  from_city: el.sendLocation,
                  to_city: el.cargoDeliveryLocation,
                },
                add_two_days: "",
                adr: el.isDangrousCargo,
                comment: "",
                comment_client: "",
                cubic: "",
                currency: el.currency?.name,
                date_create: new Date(el.createdAt),
                date_send: el.sendCargoDate,
                driver_id: el.driverId,
                end_client: "",
                end_date: "",
                end_driver: "",
                height_box: el.cargoHeight,
                length_box: el.cargoLength,
                loading: "",
                mode: "",
                no_cash: el.isCashlessPayment,
                orders_accepted: el.acceptedOrders,
                price: el.offeredPrice,
                raiting_driver: "",
                raiting_user: "",
                route_id: "",
                save_order: "",
                secure_transaction: el.isSafe,
                status: el.status,
                transport_type: el.transportType?.name,
                transport_types: el.transportTypes,
                type_cargo: el.cargoType?.code,
                user_id: el.clientId,
                weight: el.cargoWeight,
                width_box: el.cargoWidth,
                created_at: new Date(el.createdAt),
                logo: el.merchant?.logoFilePath,
                merchant: el.merchant
              };
            });
          }
        connect = await database.connection.getConnection();
        let queryFilter = ``;
        if(id) {
            queryFilter += `id = ${id} `;
        }
        if(sendCargoDate) {
            queryFilter += ` ${queryFilter.length ? ` AND ` : ''} date_send = ${sendCargoDate} `;
        }
        if(status != undefined && status != '') {
            queryFilter += ` ${queryFilter.length ? ` AND ` : ''} status = ${status} `;
        }
        if(isSafeOrder) {
            queryFilter += ` ${queryFilter.length ? ` AND ` : ''} secure_transaction = ${isSafeOrder} `;
        }
        let query = 'SELECT * FROM orders';
        if(queryFilter.length) {
            query += ' WHERE ' + queryFilter;
        }
        query += ' ORDER BY id DESC LIMIT ?, ?'
        const [rows] = await connect.query(query, [from, limit]);
        const [rows_count] = await connect.query(`SELECT count(*) as allcount FROM orders ${queryFilter.length ? ` WHERE ` + queryFilter : ''} ORDER BY id DESC`);
       
        if (rows.length || merchantData.length){
            appData.data_count = rows_count[0].allcount
            let data= [...merchantData ,...rows];
            data = (data.sort((a,b) => {
                if (a.date_create < b.date_create) {
                    return 1;
                  }
                  if (a.date_create > b.date_create) {
                    return -1;
                  }
                  return 0;
            })).slice(0, limit)
            appData.data = await Promise.all(data.map(async (item) => {
                let newItem = item;
                if (!item.isMerchant) {
                    if(item.transport_types) {
                        newItem.transport_types = JSON.parse(item.transport_types);
                    }
                  }
                const [orders_accepted] = await connect.query('SELECT oa.price as priceorder,oa.one_day,oa.two_day,oa.three_day,oa.status_order,oa.date_create as date_create_accepted FROM orders_accepted oa LEFT JOIN users_list ul ON ul.id = oa.user_id WHERE oa.order_id = ?',[item.isMerchant ? +item.id.split("M")[1] : item.id]);
                newItem.orders_accepted = orders_accepted;
                if (!item.isMerchant) {
                    const [route] = await connect.query(
                      "SELECT * FROM routes WHERE id = ? LIMIT 1",
                      [item.route_id]
                    );
                    newItem.route = route[0];
                }
                if (!item.isMerchant) {
                  const [userinfo] = await connect.query('SELECT * FROM users_list WHERE id = ? LIMIT 1',[item.user_id]);
                  newItem.userinfo = userinfo[0];
                }
                return newItem;
            }
            ));

            if(sendLocation) {
                data = data.filter((el) => el.route.from_city == sendLocation);
            }
            if(cargoDeliveryLocation) {
                data = data.filter((el) => el.route.to_city == cargoDeliveryLocation);
            }

            appData.status = true;
        }else {
            appData.error = 'Нет заказов';
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
        const [rows] = await connect.query('SELECT ua.*,ul.* FROM users_activity ua LEFT JOIN users_list ul ON ul.id = ua.userid ORDER BY ua.date DESC LIMIT ?, ?',[from,limit]);
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
reborn.post("/getAllDriversByAgent", async (req, res) => {
  let connect,
    from = +req.body.from,
    limit = +req.body.limit,
    driver_id = +req.body.driver_id,
    transport_number = req.body.transport_number,
    agent_id = req.body.agent_id ? req.body.agent_id : "",
    paid_way_kz = req.body.paid_way_kz,
    [rows] = [],
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    [rows] = await connect.query(
      `SELECT DISTINCT ul.*
      FROM users_transport ut 
      LEFT JOIN users_list ul ON ul.id = ut.user_id  
      WHERE ul.user_type = 1  
      AND ul.agent_id = ?  ${driver_id ? ' AND ul.id = '+driver_id : ''} ${paid_way_kz ? ` AND ul.paid_way_kz = ${paid_way_kz}` : ''}
      ORDER BY ul.id DESC 
      LIMIT ?, ?;
      `,
      [agent_id, from, limit]
    );
    const [rows_count] = await connect.query(
      `SELECT count(*) as allcount FROM users_list WHERE user_type = 1 AND agent_id = ${agent_id} ${driver_id ? ' AND id = '+driver_id : ''}  ORDER BY id DESC`
    );
    if (rows.length) {
      appData.data_count = rows_count[0].allcount;
      appData.data = await Promise.all(
        rows.map(async (row) => {
          let newUser = row;
          newUser.avatar = fs.existsSync(process.env.FILES_PATCH +"tirgo/drivers/"+ row.id +"/" +row.avatar)? process.env.SERVER_URL +  "tirgo/drivers/" + row.id + "/" +  row.avatar            : null;
          const [files] = await connect.query( "SELECT * FROM users_list_files WHERE user_id = ?",[row.id]);
          newUser.files = await Promise.all(files.map(async (file) => {
              let newFile = file;
              newFile.preview = fs.existsSync( process.env.FILES_PATCH +"tirgo/drivers/" +row.id +"/" + file.name)
                ? process.env.SERVER_URL + "tirgo/drivers/" + row.id + "/" + file.name: null;
              return newFile;
            })
          );
          const [trucks] = await connect.query(
            "SELECT * FROM users_transport WHERE user_id = ?",
            [row.id]
          );
          newUser.trucks = await Promise.all(
            trucks.map(async (truck) => {
              const [filestruck] = await connect.query(
                "SELECT * FROM users_transport_files WHERE transport_id = ?",
                [truck.id]
              );
              let newTruck = truck;
              newTruck.docks = await Promise.all(
                filestruck.map(async (filetruck) => {
                  let docks = filetruck;
                  docks.preview = fs.existsSync( process.env.FILES_PATCH + row.id + "/" + filetruck.name)
                    ? process.env.SERVER_URL + "tirgo/drivers/" + row.id + "/" + filetruck.name : null;
                  return docks;
                })
              );
              return newTruck;
            })
          );
          const [orders] = await connect.query(
            "SELECT * FROM orders_accepted oa LEFT JOIN orders o ON oa.order_id = o.id WHERE oa.user_id = ?",
            [row.id]
          );
          newUser.orders = orders;
          const [contacts] = await connect.query(
            "SELECT * FROM users_contacts WHERE user_id = ?",
            [row.id]
          );
          newUser.contacts = contacts;
          return newUser;
        })
      );
      if(transport_number) {
        appData.data = appData.data.filter((el) => el.trucks?.length && el?.trucks.some((tr) => tr.transport_number == transport_number));
      }
      appData.status = true;
    }
    res.status(200).json(appData);
  } catch (e) {
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

module.exports = reborn;