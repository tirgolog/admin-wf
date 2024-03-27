const express = require("express"),
  Minio = require("minio"),
  multer = require("multer"),
  admin = express.Router(),
  database = require("../Database/database"),
  cors = require("cors"),
  fs = require("fs"),
  push = require("../Modules/Push"),
  jwt = require("jsonwebtoken");
const crypto = require("crypto");
const socket = require("../Modules/Socket");
const { userInfo } = require("os");
const amqp = require("amqplib");
const axios = require("axios");
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
});

//Beeline
// const minioClient = new Minio.Client({
//   endPoint: "185.183.243.223",
//   port: 9000,
//   useSSL: false,
//   accessKey: "4iC87KDCglhYTPZGpA0D",
//   secretKey: "1EnXPZiSEdHrJluSPgYLMQXuxbcSJF3TWIiklZDs",
// });

//AWS
const minioClient = new Minio.Client({
  endPoint: "13.232.83.179",
  port: 9000,
  useSSL: false,
  accessKey: "2ByR3PpFGckilG4fhSaJ",
  secretKey: "8UH4HtIBc7WCwgCVshcxmQslHFyJB8Y79Bauq5Xd",
});
admin.use(cors());

admin.post("/loginAdmin", async (req, res) => {
  let connect,
    appData = { status: false },
    login = req.body.name,
    password = req.body.password;
  try {
    password = crypto.createHash("md5").update(password).digest("hex");
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_list WHERE username = ? AND password = ? AND (user_type = 3 OR user_type = 4) AND ban <> 1",
      [login, password]
    );
    if (rows.length) {
      appData.status = true;
      await connect.query(
        "UPDATE users_list SET date_last_login = ? WHERE id = ?",
        [new Date(), rows[0].id]
      );
      //appData.token = jwt.sign({id: rows[0].id, type_business: rows[0].type_business, type_user: rows[0].type_user,}, process.env.SECRET_KEY);
      appData.token = jwt.sign(
        {
          id: rows[0].id,
          type_business: rows[0].type_business,
          type_user: rows[0].type_user,
          user_type: rows[0].user_type,
        },
        process.env.SECRET_KEY
      );
    } else {
      appData.error = "Данные для входа введены неверно";
    }
    res.status(200).json(appData);
  } catch (err) {
    console.log(err);
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.use((req, res, next) => {
  let token =
    req.body.token ||
    req.headers["token"] ||
    (req.headers.authorization && req.headers.authorization.split(" ")[1]);
  let appData = {};
  if (token) {
    jwt.verify(token, process.env.SECRET_KEY, function (err) {
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

admin.get("/getAllAgent", async (req, res) => {
  let connect,
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_list WHERE user_type = 4 ORDER BY id DESC"
    );
    if (rows.length) {
      appData.data = rows;
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

admin.put("/changeAgentBalance", async (req, res) => {
  let connect,
    appData = { status: false },
    agent_id = req.body.agent_id,
    agent_balance = req.body.agent_balance,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);

  try {
    connect = await database.connection.getConnection();
    const insertResult = await connect.query(
      "INSERT INTO agent_transaction SET admin_id = ?, agent_id = ?, amount = ?, created_at = ?, type = 'Пополнение'",
      [userInfo.id, agent_id, agent_balance, new Date()]
    );

    // SELECT at.*, u_admin.name AS admin_name, u_agent.name AS agent_name
    // FROM agent_transaction at
    // LEFT JOIN users_list u_admin ON u_admin.id = at.admin_id
    // LEFT JOIN users_list u_agent ON u_agent.id = at.agent_id;

    if (insertResult) {
      appData.data = insertResult;
      appData.status = true;
      res.status(200).json(appData);
    } else {
      appData.status = false;
      res.status(200).json(appData);
    }
  } catch (e) {
    console.log(e);
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.get("/getAgent/:agent_id", async (req, res) => {
  let connect,
    appData = { status: false },
    agent_id = req.params.agent_id;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_list WHERE user_type = 4 AND id = ?",
      [agent_id]
    );
    if (rows.length) {
      appData.status = true;
      appData.data = rows[0];
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

admin.get("/getAgentBalanse/:agent_id", async (req, res) => {
  let connect,
    appData = { status: false },
    agent_id = req.params.agent_id;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      `SELECT 
      COALESCE((SELECT SUM(amount) FROM agent_transaction WHERE agent_id = ? AND type = 'Пополнение'), 0) - 
      COALESCE((SELECT SUM(amount) FROM agent_transaction WHERE agent_id = ? AND type = 'Подписка'), 0) AS total_amount
    `,
      [agent_id, agent_id]
    );
    if (rows.length) {
      appData.status = true;
      appData.data = rows[0];
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

admin.get("/sumOfDriversSubcription/:agent_id", async (req, res) => {
  let connect,
    appData = { status: false };
  agent_id = req.params.agent_id;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      `  SELECT   amount  FROM   subscription_transaction   WHERE  agent_id = ?`,
      [agent_id]
    );
    const total_sum = rows.reduce(
      (accumulator, secure) => accumulator + +Number(secure.amount),
      0
    );
    if (rows.length) {
      appData.status = true;
      appData.data = { total_sum: total_sum };
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

admin.post("/getAllUsers", async (req, res) => {
  let connect,
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_list WHERE user_type = 2 ORDER BY id DESC"
    );
    if (rows.length) {
      appData.data = await Promise.all(
        rows.map(async (row) => {
          let newUser = row;
          newUser.avatar = fs.existsSync(
            process.env.FILES_PATCH +
              "tirgo/clients/" +
              row.id +
              "/" +
              row.avatar
          )
            ? process.env.SERVER_URL +
              "tirgo/clients/" +
              row.id +
              "/" +
              row.avatar
            : null;
          const [contacts] = await connect.query(
            "SELECT * FROM users_contacts WHERE user_id = ?",
            [row.id]
          );
          newUser.contacts = contacts;
          return newUser;
        })
      );
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

admin.post("/getAllDrivers", async (req, res) => {
  let connect,
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_list WHERE user_type = 1 ORDER BY id DESC"
    );
    if (rows.length) {
      appData.data = await Promise.all(
        rows.map(async (row) => {
          let newUser = row;
          newUser.avatar = fs.existsSync(
            process.env.FILES_PATCH +
              "tirgo/drivers/" +
              row.id +
              "/" +
              row.avatar
          )
            ? process.env.SERVER_URL +
              "tirgo/drivers/" +
              row.id +
              "/" +
              row.avatar
            : null;
          const [files] = await connect.query(
            "SELECT * FROM users_list_files WHERE user_id = ?",
            [row.id]
          );
          newUser.files = await Promise.all(
            files.map(async (file) => {
              let newFile = file;
              newFile.preview = fs.existsSync(
                process.env.FILES_PATCH +
                  "tirgo/drivers/" +
                  row.id +
                  "/" +
                  file.name
              )
                ? process.env.SERVER_URL +
                  "tirgo/drivers/" +
                  row.id +
                  "/" +
                  file.name
                : null;
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
                  docks.preview = fs.existsSync(
                    process.env.FILES_PATCH +
                      "tirgo/drivers/" +
                      row.id +
                      "/" +
                      filetruck.name
                  )
                    ? process.env.SERVER_URL +
                      "tirgo/drivers/" +
                      row.id +
                      "/" +
                      filetruck.name
                    : null;
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

admin.post("/appendOrderDriver", async (req, res) => {
  let connection,
    appData = { status: false, timestamp: new Date().getTime() },
    orderid = req.body.orderid,
    price = req.body.price,
    userid = req.body.userid,
    isMerchant = req.body.isMerchant ? req.body.isMerchant : null;
  const amqp = require("amqplib");
  const amqpConnection = await amqp.connect("amqp://13.232.83.179:5672");
  const channel = await amqpConnection.createChannel();
  await channel.assertQueue("acceptAdminAppendOrder");
  try {
    connection = await database.connection.getConnection();
    const [inProccessOrder] = await connection.query(
      "SELECT * FROM orders_accepted WHERE user_id = ? AND status_order = 1",
      [userid, orderid]
    );
    if (inProccessOrder.length) {
      console.error("Driver has active order !");
      appData.status = false;
      appData.error =
        "Невозможно назначить водителя, у Водителя уже есть активный Заказ";
    } else {
      const [isset] = await connection.query(
        "SELECT * FROM orders_accepted WHERE user_id = ? AND order_id = ? AND status_order = 0",
        [userid, orderid]
      );
      if (!isset.length) {
        // Start the transaction
        await connection.beginTransaction();

        // Execute the first query to update orders
        const updateResult = await connection.query(
          "UPDATE orders SET status = 1 WHERE id = ?",
          [orderid]
        );

        // Check if rows were affected by the update query
        if (updateResult[0].affectedRows === 0) {
          throw new Error(
            "No rows were updated. Transaction will be rolled back."
          );
        }

        // Execute the second query to insert into orders_accepted
        const insertResult = await connection.query(
          "INSERT INTO orders_accepted SET user_id = ?, order_id = ?, price = ?, status_order = 1, ismerchant = ?",
          [userid, orderid, price, isMerchant]
        );

        // Check if rows were affected by the insert query
        if (insertResult[0].affectedRows === 0) {
          // If the second query fails, explicitly trigger a rollback
          throw new Error(
            "No rows were inserted. Transaction will be rolled back."
          );
        }

        // Commit the transaction
        await connection.commit();

        // Notify clients about the update
        socket.updateAllList("update-all-list", "1");
        if (isMerchant) {
          await channel.sendToQueue(
            "acceptAdminAppendOrder",
            Buffer.from(JSON.stringify(orderid))
          );
        }
        appData.status = true;
      } else {
        appData.error =
          "Невозможно назначить водителя, Водитель уже предложил цену";
      }
    }
    res.status(200).json(appData);
  } catch (err) {
    // If an error occurs, rollback the transaction
    if (connection) {
      await connection.rollback();
    }
    console.error("Transaction rolled back:", err);
    appData.status = false;
    appData.error = err.message;
    res.status(403).json(appData);
  } finally {
    // Release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
});

admin.post("/acceptOrderDriver", async (req, res) => {
  let connection,
    appData = { status: false, timestamp: new Date().getTime() },
    orderid = req.body.orderid,
    price = req.body.price,
    userid = req.body.userid,
    isMerchant = req.body.isMerchant ? req.body.isMerchant : null;
  const amqp = require("amqplib");
  const amqpConnection = await amqp.connect("amqp://13.232.83.179:5672");
  const channel = await amqpConnection.createChannel();
  await channel.assertQueue("acceptAdminAppendOrder");
  try {
    connection = await database.connection.getConnection();
    const [isset] = await connection.query(
      "SELECT * FROM orders_accepted WHERE user_id = ? AND order_id = ? AND status_order = 0",
      [userid, orderid]
    );
    if (isset.length) {
      // Start the transaction
      await connection.beginTransaction();

      // Execute the first query to update orders
      const updateResult = await connection.query(
        "UPDATE orders SET status = 1 WHERE id = ?",
        [orderid]
      );

      // Check if rows were affected by the update query
      if (updateResult[0].affectedRows === 0) {
        throw new Error(
          "No rows were updated. Transaction will be rolled back."
        );
      }

      // Execute the second query to update orders_accepted
      const insertResult = await connection.query(
        "UPDATE orders_accepted SET status_order = 1"
      );

      // Check if rows were affected by the insert query
      if (insertResult[0].affectedRows === 0) {
        // If the second query fails, explicitly trigger a rollback
        throw new Error(
          "No rows were inserted. Transaction will be rolled back."
        );
      }

      // Commit the transaction
      await connection.commit();

      // Notify clients about the update
      socket.updateAllList("update-all-list", "1");
      if (isMerchant) {
        await channel.sendToQueue(
          "acceptAdminAppendOrder",
          Buffer.from(JSON.stringify(orderid))
        );
      }
      appData.status = true;
    } else {
      appData.error = "Невозможно принять водителя, Водитель не предложил цену";
    }
    res.status(200).json(appData);
  } catch (err) {
    // If an error occurs, rollback the transaction
    if (connection) {
      await connection.rollback();
    }
    console.error("Transaction rolled back:", err);
    appData.status = false;
    appData.error = err.message;
    res.status(403).json(appData);
  } finally {
    // Release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
});

admin.post("/createOrder", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    data = req.body.data;
  try {
    console.log(data);
    connect = await database.connection.getConnection();
    const [routes] = await connect.query(
      "SELECT * FROM routes WHERE from_city_id = ? AND to_city_id = ? LIMIT 1",
      [data.city_start_id, data.city_finish_id]
    );
    if (routes.length) {
      const [rows] = await connect.query(
        "INSERT INTO orders SET user_id = ?,price = ?,date_send = ?,add_two_days = ?,length_box = ?,width_box = ?,height_box = ?,transport_type = ?,weight = ?,type_cargo = ?,route_id = ?,no_cash = ?,adr = ?",
        [
          data.userid,
          data.price,
          new Date(data.date_start),
          data.add_two_days,
          data.length_box,
          data.width_box,
          data.height_box,
          data.typetransport,
          data.weight,
          data.typecargo,
          routes[0].id,
          data.no_cash ? data.no_cash : 0,
          data.adr,
        ]
      );
      if (rows.affectedRows) {
        appData.status = true;
        socket.updateAllList("update-all-list", "1");
      } else {
        appData.error = "Невозможно добавить заказ";
      }
    } else {
      const [routesadd] = await connect.query(
        "INSERT INTO routes SET from_city_id = ?,from_city = ?, to_city_id = ?,to_city = ?,to_lat = ?,to_lng = ?,from_lat = ?,from_lng = ?",
        [
          data.city_start_id,
          data.city_start,
          data.city_finish_id,
          data.city_finish,
          data.finish_lat,
          data.finish_lng,
          data.start_lat,
          data.start_lng,
        ]
      );
      if (routesadd.affectedRows) {
        const [rows] = await connect.query(
          "INSERT INTO orders SET user_id = ?,price = ?,date_send = ?,add_two_days = ?,length_box = ?,width_box = ?,height_box = ?,transport_type = ?,weight = ?,type_cargo = ?,route_id = ?,no_cash = ?,adr = ?",
          [
            data.userid,
            data.price,
            new Date(data.date_start),
            data.add_two_days,
            data.length_box,
            data.width_box,
            data.height_box,
            data.typetransport,
            data.weight,
            data.typecargo,
            routesadd.insertId,
            data.no_cash ? data.no_cash : 0,
            data.adr,
          ]
        );
        if (rows.affectedRows) {
          appData.status = true;
          socket.updateAllList("update-all-list", "1");
        } else {
          appData.error = "Невозможно добавить заказ";
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
      connect.release();
    }
  }
});

admin.post("/addUser", async (req, res) => {
  let connect,
    cityInfo = req.body.cityinfo,
    data = req.body.datauser,
    phone = "",
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    phone = data.phone.replace(/[^0-9, ]/g, "").replace(/ /g, "");
    const [rows] = await connect.query(
      "SELECT * FROM users_contacts WHERE text = ? AND verify = 1",
      [phone]
    );
    if (rows.length > 0) {
      appData.error = "Пользователь уже зарегистрирован";
      appData.status = false;
      res.status(400).json(appData);
    } else {
      if (data.agent_id) {
        const [agent] = await connect.query(
          "SELECT * FROM users_list where  user_type=4 AND id=? ",
          [data.agent_id]
        );
        if (agent.length > 0) {
          const [subscription] = await connect.query(
            "SELECT * FROM subscription where id = ? ",
            [data.subscription_id]
          );
          const [agentBalance] = await connect.query(
            `SELECT 
            COALESCE((SELECT SUM(amount) FROM agent_transaction WHERE agent_id = ? AND type = 'Пополнение'), 0) - 
            COALESCE((SELECT SUM(amount) FROM agent_transaction WHERE agent_id = ? AND type = 'Подписка'), 0) AS total_amount
          `,
            [data.agent_id, data.agent_id]
          );
          if (agentBalance.length) {
            if (subscription[0].duration === 1) {
              let paymentValue = 80000;
              if (
                Number(agentBalance[0].total_amount) >= Number(paymentValue)
              ) {
                const insertResult = await connect.query(
                  "INSERT INTO agent_transaction SET  agent_id = ?, amount = ?, created_at = ?, type = 'Подписка'",
                  [data.agent_id, paymentValue, new Date()]
                );
                if (insertResult) {
                  let nextthreeMonth = new Date(
                    new Date().setMonth(
                      new Date().getMonth() + subscription[0].duration
                    )
                  );
                  const [insert] = await connect.query(
                    "INSERT INTO users_list SET country = ?,city = ?,geo_id = ?,iso_code = ?,city_lat = ?,city_lng = ?,phone = ?,user_type = 1,name = ?,birthday = ?,email = ?, agent_id = ?, subscription_id = ?, date_last_login = NULL, from_subscription = ? , to_subscription=? ",
                    [
                      cityInfo.country,
                      cityInfo.city ? cityInfo.city : cityInfo.region,
                      cityInfo.geoname_id ? cityInfo.geoname_id : "0",
                      cityInfo.country_iso_code,
                      cityInfo.geo_lat,
                      cityInfo.geo_lon,
                      phone,
                      data.name,
                      new Date(data.birthday),
                      data.email,
                      data.agent_id,
                      data.subscription_id,
                      new Date(),
                      nextthreeMonth,
                    ]
                  );
                  await connect.query(
                    "INSERT INTO users_contacts SET text=?,user_type = 1,user_id = ?,verify = 1",
                    [phone, insert.insertId]
                  );
                  await connect.query(
                    "INSERT INTO users_transport SET type = ?,user_id = ?",
                    [data.type, insert.insertId]
                  );
                  await connect.query(
                    "INSERT INTO subscription_transaction SET userid = ?, subscription_id = ?, phone = ?, amount = ?, agent_id = ?",
                    [
                      insert.insertId,
                      data.subscription_id,
                      phone,
                      paymentValue,
                      data.agent_id,
                    ]
                  );
                  appData.id = insert.insertId;
                  appData.status = true;
                  res.status(200).json(appData);
                } else {
                  appData.error = "не могу добавить транзакцию подписки";
                  appData.status = false;
                  res.status(400).json(appData);
                }
              } else {
                appData.error = "Баланса недостаточно";
                appData.status = false;
                res.status(400).json(appData);
              }
            } else if (subscription[0].duration === 3) {
              let paymentValue = 180000;
              if (
                Number(agentBalance[0].total_amount) >= Number(paymentValue)
              ) {
                const insertResult = await connect.query(
                  "INSERT INTO agent_transaction SET  agent_id = ?, amount = ?, created_at = ?, type = 'Подписка'",
                  [data.agent_id, paymentValue, new Date()]
                );
                if (insertResult) {
                  let nextthreeMonth = new Date(
                    new Date().setMonth(
                      new Date().getMonth() + subscription[0].duration
                    )
                  );
                  const [insert] = await connect.query(
                    "INSERT INTO users_list SET country = ?,city = ?,geo_id = ?,iso_code = ?,city_lat = ?,city_lng = ?,phone = ?,user_type = 1,name = ?,birthday = ?,email = ?, agent_id = ?, subscription_id = ?, date_last_login = NULL, from_subscription = ? , to_subscription=? ",
                    [
                      cityInfo.country,
                      cityInfo.city ? cityInfo.city : cityInfo.region,
                      cityInfo.geoname_id ? cityInfo.geoname_id : "0",
                      cityInfo.country_iso_code,
                      cityInfo.geo_lat,
                      cityInfo.geo_lon,
                      phone,
                      data.name,
                      new Date(data.birthday),
                      data.email,
                      data.agent_id,
                      data.subscription_id,
                      new Date(),
                      nextthreeMonth,
                    ]
                  );
                  await connect.query(
                    "INSERT INTO users_contacts SET text=?,user_type = 1,user_id = ?,verify = 1",
                    [phone, insert.insertId]
                  );
                  await connect.query(
                    "INSERT INTO users_transport SET type = ?,user_id = ?",
                    [data.type, insert.insertId]
                  );
                  await connect.query(
                    "INSERT INTO subscription_transaction SET userid = ?, subscription_id = ?, phone = ?, amount = ?, agent_id = ?",
                    [
                      insert.insertId,
                      data.subscription_id,
                      phone,
                      paymentValue,
                      data.agent_id,
                    ]
                  );
                  appData.id = insert.insertId;
                  appData.status = true;
                  res.status(200).json(appData);
                } else {
                  appData.error = "не могу добавить транзакцию подписки";
                  appData.status = false;
                  res.status(400).json(appData);
                }
              } else {
                appData.error = "Баланса недостаточно";
                appData.status = false;
                res.status(400).json(appData);
              }
            } else if (subscription[0].duration === 12) {
              let paymentValue = 570000;
              if (
                Number(agentBalance[0].total_amount) >= Number(paymentValue)
              ) {
                const insertResult = await connect.query(
                  "INSERT INTO agent_transaction SET  agent_id = ?, amount = ?, created_at = ?, type = 'Подписка'",
                  [data.agent_id, paymentValue, new Date()]
                );
                if (insertResult) {
                  let nextthreeMonth = new Date(
                    new Date().setMonth(
                      new Date().getMonth() + subscription[0].duration
                    )
                  );
                  const [insert] = await connect.query(
                    "INSERT INTO users_list SET country = ?,city = ?,geo_id = ?,iso_code = ?,city_lat = ?,city_lng = ?,phone = ?,user_type = 1,name = ?,birthday = ?,email = ?, agent_id = ?, subscription_id = ?, date_last_login = NULL, from_subscription = ? , to_subscription=? ",
                    [
                      cityInfo.country,
                      cityInfo.city ? cityInfo.city : cityInfo.region,
                      cityInfo.geoname_id ? cityInfo.geoname_id : "0",
                      cityInfo.country_iso_code,
                      cityInfo.geo_lat,
                      cityInfo.geo_lon,
                      phone,
                      data.name,
                      new Date(data.birthday),
                      data.email,
                      data.agent_id,
                      data.subscription_id,
                      new Date(),
                      nextthreeMonth,
                    ]
                  );
                  await connect.query(
                    "INSERT INTO users_contacts SET text=?,user_type = 1,user_id = ?,verify = 1",
                    [phone, insert.insertId]
                  );
                  await connect.query(
                    "INSERT INTO users_transport SET type = ?,user_id = ?",
                    [data.type, insert.insertId]
                  );
                  await connect.query(
                    "INSERT INTO subscription_transaction SET userid = ?, subscription_id = ?, phone = ?, amount = ?, agent_id = ?",
                    [
                      insert.insertId,
                      data.subscription_id,
                      phone,
                      paymentValue,
                      data.agent_id,
                    ]
                  );
                  appData.id = insert.insertId;
                  appData.status = true;
                  res.status(200).json(appData);
                } else {
                  appData.error = "не могу добавить транзакцию подписки";
                  appData.status = false;
                  res.status(400).json(appData);
                }
              } else {
                appData.error = "Баланса недостаточно";
                appData.status = false;
                res.status(400).json(appData);
              }
            }
          }
        }
      } else {
        const [insert] = await connect.query(
          "INSERT INTO users_list SET country = ?,city = ?,geo_id = ?,iso_code = ?,city_lat = ?,city_lng = ?,phone = ?,user_type = 1,name = ?,birthday = ?,email = ?,date_last_login = NULL",
          [
            cityInfo.country,
            cityInfo.city ? cityInfo.city : cityInfo.region,
            cityInfo.geoname_id ? cityInfo.geoname_id : "0",
            cityInfo.country_iso_code,
            cityInfo.geo_lat,
            cityInfo.geo_lon,
            phone,
            data.name,
            new Date(data.birthday),
            data.email,
          ]
        );
        await connect.query(
          "INSERT INTO users_contacts SET text=?,user_type = 1,user_id = ?,verify = 1",
          [phone, insert.insertId]
        );
        appData.id = insert.insertId;
        appData.status = true;
      }
    }
    // res.status(200).json(appData);
  } catch (e) {
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.post("/createClient", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    name = req.body.name,
    phone = req.body.phone,
    email = req.body.email ? req.body.email : "",
    cityInfo = req.body.cityInfo;
  try {
    connect = await database.connection.getConnection();
    const [isset] = await connect.query(
      "SELECT * FROM users_contacts WHERE text = ? AND verify = 1 LIMIT 1",
      [phone]
    );
    if (!isset.length) {
      const [rows] = await connect.query(
        "INSERT INTO users_list SET country = ?,city = ?,geo_id = ?,iso_code = ?,city_lat = ?,city_lng = ?,name = ?,phone = ?,user_type = 2,email = ?",
        [
          cityInfo.country,
          cityInfo.city,
          cityInfo.geoname_id,
          cityInfo.country_iso_code,
          cityInfo.geo_lat,
          cityInfo.geo_lon,
          name,
          phone,
          email,
        ]
      );
      if (rows.affectedRows) {
        await connect.query(
          "INSERT INTO users_contacts SET type = ?,text = ?,user_id = ?,user_type = 2",
          ["phone", phone, rows.insertId]
        );
        appData.status = true;
      } else {
        appData.error = "Что то пошло не так";
      }
    } else {
      appData.error = "Такой пользователь уже зарегестрирован";
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.post("/getAllAdmins", async (req, res) => {
  let connect,
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_list WHERE user_type = 3 OR user_type = 4"
    );
    if (rows.length) {
      appData.data = rows;
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
admin.post("/saveRole", async (req, res) => {
  let connect,
    id = req.body.id,
    data = req.body.data,
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    console.log(data);
    if (id !== 0) {
      await connect.query("UPDATE role_user SET ? WHERE id = ?", [data, id]);
      appData.status = true;
    } else {
      await connect.query("INSERT INTO role_user SET ?", [data]);
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
admin.post("/addAdmin", async (req, res) => {
  let connect,
    phone = req.body.phone,
    name = req.body.name,
    username = req.body.username,
    role = req.body.role,
    password = req.body.password,
    editaid = req.body.editaid ? req.body.editaid : 0,
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    password =
      password !== ""
        ? crypto.createHash("md5").update(password).digest("hex")
        : "";
    const [roleAgent] = await connect.query(
      "SELECT * FROM role_user where name ='Агент'"
    );
    if (roleAgent[0].id == role) {
      if (editaid > 0) {
        if (password === "") {
          const [edit] = await connect.query(
            "UPDATE users_list SET phone = ?,name = ?,username = ?,role = ?,user_type = ?  WHERE id = ?",
            [phone, name, username, role, 4, editaid]
          );
          if (edit.affectedRows) {
            appData.status = true;
          }
        } else {
          const [edit] = await connect.query(
            "UPDATE users_list SET phone = ?,name = ?,username = ?,role = ?,password = ?,user_type = ? WHERE id = ?",
            [phone, name, username, role, password, 4, editaid]
          );
          if (edit.affectedRows) {
            appData.status = true;
          }
        }
      } else {
        const [rows] = await connect.query(
          "INSERT INTO users_list SET phone = ?,name = ?,username = ?,role = ?,password = ?,user_type = ?",
          [phone, name, username, role, password, 4]
        );
        if (rows.affectedRows) {
          appData.status = true;
        }
      }
    } else {
      if (editaid > 0) {
        if (password === "") {
          const [edit] = await connect.query(
            "UPDATE users_list SET phone = ?,name = ?,username = ?,role = ?,user_type = ? WHERE id = ?",
            [phone, name, username, role, 3, editaid]
          );
          if (edit.affectedRows) {
            appData.status = true;
          }
        } else {
          const [edit] = await connect.query(
            "UPDATE users_list SET phone = ?,name = ?,username = ?,role = ?,password = ?,user_type = ? WHERE id = ?",
            [phone, name, username, role, password, 3, editaid]
          );
          if (edit.affectedRows) {
            appData.status = true;
          }
        }
      } else {
        const [rows] = await connect.query(
          "INSERT INTO users_list SET phone = ?,name = ?,username = ?,role = ?,password = ?,user_type = ?",
          [phone, name, username, role, password, 3]
        );
        if (rows.affectedRows) {
          appData.status = true;
        }
      }
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
admin.post("/getAllRoles", async (req, res) => {
  let connect,
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query("SELECT * FROM role_user");
    if (rows.length) {
      appData.data = rows;
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
admin.post("/closeOrder", async (req, res) => {
  const connection = await amqp.connect("amqp://13.232.83.179:5672");
  const channel = await connection.createChannel();
  await channel.assertQueue("cancelOrder");
  let connect,
    orderid = req.body.orderid,
    appData = { status: false },
    ismerchant = req.body.isMerchant;
  try {
    connect = await database.connection.getConnection();
    if (ismerchant) {
      channel.sendToQueue("cancelOrder", Buffer.from(JSON.stringify(orderid)));
      appData.status = true;
    } else {
      const [rows] = await connect.query(
        "UPDATE orders SET status = 3 WHERE id = ?",
        [orderid]
      );
      if (rows.affectedRows) {
        appData.data = rows;
        appData.status = true;
      }
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
admin.post("/endOrder", async (req, res) => {
  let connect,
    orderid = req.body.orderid,
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE orders SET status = 3 WHERE id = ?",
      [orderid]
    );
    if (rows.affectedRows) {
      appData.data = rows;
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
admin.post("/getActivityUsers", async (req, res) => {
  let connect,
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT ua.*,ul.name FROM users_activity ua LEFT JOIN users_list ul ON ul.id = ua.userid ORDER BY ua.date DESC"
    );
    if (rows.length) {
      appData.data = rows;
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
admin.post("/getSecureTrans", async (req, res) => {
  let connect,
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM secure_transaction ORDER BY date DESC"
    );
    if (rows.length) {
      appData.data = rows;
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
admin.post("/getTransactionsType", async (req, res) => {
  let connect,
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM transactions_type ORDER BY id DESC"
    );
    if (rows.length) {
      appData.data = rows;
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
admin.post("/addTransportToUser", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
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
    const [rows] = await connect.query(
      "INSERT INTO users_transport SET name = ?,description = ?,type = ?,max_weight = ?,user_id = ?,adr = ?,cubature = ?,state_number = ?",
      [name, description, type, maxweight, userid, adr, cubature, state_number]
    );
    if (rows.affectedRows) {
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
    } else {
      appData.error = "Не получилось добавить транспорт. Попробуйте позже.";
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.post("/addTransportToUserByAgent", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    type = req.body.type,
    subscription_id = req.body.subscription_id,
    userid = req.body.userid;

  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "INSERT INTO users_transport SET type = ?, subscription_id = ?,user_id = ?",
      [type, subscription_id, userid]
    );
    if (rows.affectedRows) {
      appData.status = true;
    } else {
      appData.error = "Не получилось добавить транспорт. Попробуйте позже.";
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.post("/getAllOrders", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM orders ORDER BY id DESC "
    );
    if (rows.length) {
      appData.data = await Promise.all(
        rows.map(async (item) => {
          let newItem = item;
          const [orders_accepted] = await connect.query(
            "SELECT ul.*,oa.price as priceorder,oa.one_day,oa.two_day,oa.three_day,oa.status_order,oa.date_create as date_create_accepted FROM orders_accepted oa LEFT JOIN users_list ul ON ul.id = oa.user_id WHERE oa.order_id = ?",
            [item.id]
          );
          newItem.transport_types = JSON.parse(item.transport_types);
          newItem.orders_accepted = await Promise.all(
            orders_accepted.map(async (item2) => {
              let newItemUsers = item2;
              newItemUsers.avatar = fs.existsSync(
                process.env.FILES_PATCH +
                  "tirgo/drivers/" +
                  item2.id +
                  "/" +
                  item2.avatar
              )
                ? process.env.SERVER_URL +
                  "tirgo/drivers/" +
                  item2.id +
                  "/" +
                  item2.avatar
                : null;
              return newItemUsers;
            })
          );
          const [route] = await connect.query(
            "SELECT * FROM routes WHERE id = ? LIMIT 1",
            [item.route_id]
          );
          newItem.route = route[0];
          const [userinfo] = await connect.query(
            "SELECT * FROM users_list WHERE id = ? LIMIT 1",
            [item.user_id]
          );
          newItem.userinfo = userinfo[0];
          return newItem;
        })
      );
      appData.status = true;
    } else {
      appData.error = "Нет типов транспорта";
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.get("/getTypeTruck", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query("SELECT * FROM trailer_type");
    if (rows.length) {
      appData.data = rows;
      appData.status = true;
    } else {
      appData.error = "Нет типов транспорта";
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.get("/getTypeCargo", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query("SELECT * FROM type_cargo");
    if (rows.length) {
      appData.data = rows;
      appData.status = true;
    } else {
      appData.error = "Нет типов транспорта";
    }
    res.status(200).json(appData);
  } catch (err) {
    console.log(err);
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.get("/getAllMessages", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    // const [rows] = await connect.query('SELECT *,ul.avatar,ul.name as username FROM chat_support cs LEFT JOIN users_list ul ON ul.id = cs.user_id GROUP BY cs.user_id, ul.avatar, ul.name');
    const [rows] = await connect.query(`
        SELECT cs.user_id, MAX(cs.id) AS max_id, ul.avatar, ul.name AS username
        FROM chat_support cs
        LEFT JOIN users_list ul ON ul.id = cs.user_id
        GROUP BY cs.user_id, ul.avatar, ul.name;
        `);
    if (rows.length) {
      appData.data = await Promise.all(
        rows.map(async (item) => {
          let newItem = item;
          newItem.avatar = fs.existsSync(
            process.env.FILES_PATCH +
              "tirgo/drivers/" +
              item.user_id +
              "/" +
              item.avatar
          )
            ? process.env.SERVER_URL +
              "tirgo/drivers/" +
              item.user_id +
              "/" +
              item.avatar
            : null;
          const [messages] = await connect.query(
            "SELECT * FROM chat_support WHERE user_id = ? ORDER BY id",
            [item.id]
          );
          newItem.messages = messages;
          return newItem;
        })
      );
      appData.status = true;
    } else {
      appData.error = "Нет типов транспорта";
    }
    res.status(200).json(appData);
  } catch (err) {
    console.log(err);
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.post("/saveUser", async (req, res) => {
  let connect,
    data = req.body.data,
    id = req.body.id,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_list SET passport_series_numbers = ?,passport_date = ?,driver_license = ? WHERE id = ?",
      [
        data.passport_series_numbers,
        new Date(data.passport_date),
        data.driver_license,
        id,
      ]
    );
    if (rows.affectedRows) {
      appData.data = rows;
      appData.status = true;
    } else {
      appData.error = "Нет типов транспорта";
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.post("/saveUserInfo", async (req, res) => {
  let connect,
    name = req.body.name,
    birthday = req.body.birthday,
    country = req.body.country,
    city = req.body.city,
    id = req.body.id,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_list SET name = ?,birthday = ?,country = ?,city = ? WHERE id = ?",
      [name, new Date(birthday), country, city, id]
    );
    if (rows.affectedRows) {
      appData.data = rows;
      appData.status = true;
    } else {
      appData.error = "Нет типов транспорта";
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.post("/savePassportUser", async (req, res) => {
  let connect,
    passport = req.body.passport,
    passportdate = req.body.passportdate,
    id = req.body.id,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_list SET passport_series_numbers = ?,passport_date = ? WHERE id = ?",
      [passport, new Date(passportdate), id]
    );
    if (rows.affectedRows) {
      appData.data = rows;
      appData.status = true;
    } else {
      appData.error = "Нет типов транспорта";
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.post("/saveNewMerchantId", async (req, res) => {
  let connect,
    merchid = req.body.merchid,
    id = req.body.id,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [isset] = await connect.query(
      "SELECT * FROM users_list WHERE merch_login IS NOT NULL AND merch_password IS NOT NULL AND id = ? ",
      [merchid]
    );
    if (isset.length) {
      const [rows] = await connect.query(
        "UPDATE users_list SET merch_id = ? WHERE id = ?",
        [merchid, id]
      );
      if (rows.affectedRows) {
        appData.data = rows;
        appData.status = true;
      } else {
        appData.error = "Нет типов транспорта";
      }
    } else {
      appData.error = "Нет такого мерчанта";
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.post("/saveDriverLicenseUser", async (req, res) => {
  let connect,
    license = req.body.license,
    id = req.body.id,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_list SET driver_license = ? WHERE id = ?",
      [license, id]
    );
    if (rows.affectedRows) {
      appData.data = rows;
      appData.status = true;
    } else {
      appData.error = "Нет типов транспорта";
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.post("/deleteUser", async (req, res) => {
  let connect,
    id = req.body.id,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_list SET deleted = 1 WHERE id = ?",
      [id]
    );
    if (rows.affectedRows) {
      appData.data = rows;
      appData.status = true;
    } else {
      appData.error = "Нет типов транспорта";
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.post("/delDirty", async (req, res) => {
  let connect,
    id = req.body.id,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_list SET dirty = 0 WHERE id = ?",
      [id]
    );
    if (rows.affectedRows) {
      appData.data = rows;
      appData.status = true;
    } else {
      appData.error = "Нет типов транспорта";
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.post("/modarateUser", async (req, res) => {
  let connect,
    id = req.body.id,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_list SET moderation = 1 WHERE id = ?",
      [id]
    );
    if (rows.affectedRows) {
      appData.data = rows;
      appData.status = true;
    } else {
      appData.error = "Что то пошло не так";
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.post("/returnUser", async (req, res) => {
  let connect,
    id = req.body.id,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_list SET deleted = 0 WHERE id = ?",
      [id]
    );
    if (rows.affectedRows) {
      appData.data = rows;
      appData.status = true;
    } else {
      appData.error = "Нет типов транспорта";
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.post("/sendMessageSupport", async (req, res) => {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    message = req.body.message,
    id = req.body.id,
    data = {},
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "INSERT INTO chat_support SET text = ?, user_id = ?,type = ?,user_admin_id = ?",
      [message, id, "text", userInfo.id]
    );
    if (rows.affectedRows) {
      data.id = rows.insertId;
      data.user_id = userInfo.id;
      data.user_admin_id = null;
      data.text = message;
      data.type = "text";
      data.status = 0;
      data.date = new Date();
      appData.data = data;
      appData.status = true;
    }
    socket.updateAllMessages("update-all-messages", "1");
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.get("/checkSessionAdmin", async function (req, res) {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_list WHERE id = ? AND  (user_type = 3 OR user_type = 4)  AND ban <> 1",
      [userInfo.id]
    );
    if (rows.length) {
      appData.user = rows[0];
      appData.status = true;
      res.status(200).json(appData);
    } else {
      res.status(200).json(appData);
    }
  } catch (err) {
    console.log(err);
    appData.status = false;
    appData.error = err;
    appData.message = err.message;
    appData.data = "Неизвестная ошибка2";
    res.status(200).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.post("/addTypeCargo", async (req, res) => {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    type = req.body.type,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "INSERT INTO type_cargo SET name = ?,admin_id = ?",
      [type, userInfo.id]
    );
    if (rows.affectedRows) {
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
      connect.release();
    }
  }
});
admin.post("/addPayment", async (req, res) => {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    type = req.body.type,
    description = req.body.description,
    amount = req.body.amount,
    id = req.body.id,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "INSERT INTO transactions SET description = ?,type = ?,user_id = ?,user_id_admin = ?,amount = ?",
      [description, type, id, userInfo.id, amount]
    );
    if (rows.affectedRows) {
      const [client] = await connect.query(
        "SELECT * FROM users_list WHERE token <> ? AND token is NOT NULL AND id = ?",
        ["", id]
      );
      if (client.length) {
        push.send(
          client[0].token,
          "Пополнение баланса",
          "Ваш баланс пополнен на " + amount,
          "",
          ""
        );
      }
      await connect.query(
        "UPDATE users_list SET balance = balance + ? WHERE id = ?",
        [amount, id]
      );
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
      connect.release();
    }
  }
});
admin.post("/bannedAdmin", async (req, res) => {
  let connect,
    id = req.body.userid,
    banned = req.body.banned,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_list SET ban = ? WHERE id = ?",
      [banned, id]
    );
    if (rows.affectedRows) {
      socket.logOutUser("log-out-user", id);
      appData.status = true;
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.post("/addTypeCar", async (req, res) => {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    data = req.body.data,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query("INSERT INTO trailer_type SET ?", [
      data,
    ]);
    if (rows.affectedRows) {
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
      connect.release();
    }
  }
});

admin.post("/uploadImage", upload.single("file"), async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  let connect,
    userInfo = await jwt.decode(req.headers.authorization.split(" ")[1]),
    appData = { status: false },
    typeUser = req.body.typeUser,
    typeImage = req.body.typeImage;
  const filePath =
    minioClient.protocol +
    "//" +
    minioClient.host +
    ":" +
    minioClient.port +
    "/" +
    "tirgo" +
    "/" +
    req.file.originalname;
  minioClient.putObject(
    "tirgo",
    req.file.originalname,
    req.file.buffer,
    function (res, error) {
      if (error) {
        return console.log(error);
      }
    }
  );
  try {
    connect = await database.connection.getConnection();
    if (typeImage === "avatar") {
      await connect.query("UPDATE users_list SET avatar = ? WHERE id = ?", [
        req.file.originalname,
        userInfo.id,
      ]);
      sharp(filePath)
        .rotate()
        .resize(400)
        .toFile(filePath, async (err, info) => {
          appData.file = {
            preview: filePath,
            filename: req.file.originalname,
          };
          appData.status = true;
          res.status(200).json(appData);
        });
    } else if (typeImage === "car-docks") {
      sharp(req.file.originalname)
        .rotate()
        .resize(400)
        .toFile(filePath, async (err, info) => {
          appData.file = {
            preview: filePath,
            filename: req.file.originalname,
          };
          appData.status = true;
          res.status(200).json(appData);
        });
    } else if (typeImage === "passport") {
      await connect.query(
        "INSERT INTO users_list_files SET user_id = ?,name = ?,type_file = ?",
        [userInfo.id, req.file.originalname, "passport"]
      );
      sharp(req.file.originalname)
        .rotate()
        .resize(400)
        .toFile(filePath, async (err, info) => {
          if (err) console.log(err);
          appData.file = {
            preview: filePath,
            filename: req.file.originalname,
          };
          appData.status = true;
          res.status(200).json(appData);
        });
    } else if (typeImage === "driver-license") {
      await connect.query(
        "INSERT INTO users_list_files SET user_id = ?,name = ?,type_file = ?",
        [userInfo.id, req.file.originalname, "driver-license"]
      );
      sharp(req.file.originalname)
        .rotate()
        .resize(400)
        .toFile(filePath, async (err, info) => {
          appData.file = {
            preview: filePath,
            filename: req.file.originalname,
          };
          appData.status = true;
          res.status(200).json(appData);
        });
    } else if (typeImage === "verification") {
      await connect.query(
        "INSERT INTO users_list_files SET user_id = ?,name = ?,type_file = ?",
        [userInfo.id, req.file.originalname, "verification"]
      );
      sharp(req.file.originalname)
        .rotate()
        .resize(400)
        .toFile(filePath, async (err, info) => {
          appData.file = {
            preview: filePath,
            filename: req.file.originalname,
          };
          appData.status = true;
          res.status(200).json(appData);
        });
    }
  } catch (err) {
    appData.status = false;
    appData.error = err.message;
    console.log(err.message);
    res.status(200).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.post("/subscription", async (req, res) => {
  let connect,
    name = req.body.name,
    value = req.body.value,
    duration = req.body.duration,
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM subscription where name = ?",
      [name]
    );
    if (rows.length > 0) {
      appData.error = "Есть подписка на это имя";
      res.status(400).json(appData);
    } else {
      const [subscription] = await connect.query(
        "INSERT INTO subscription SET name = ?, value = ?, duration = ?",
        [name, value, duration]
      );
      appData.status = true;
      appData.data = subscription;
      res.status(200).json(appData);
    }
  } catch (e) {
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.get("/subscription", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [subscription] = await connect.query("SELECT * FROM subscription");
    if (subscription.length) {
      appData.status = true;
      appData.data = subscription;
      res.status(200).json(appData);
    } else {
      appData.error = "Данные для входа введены неверно";
      res.status(400).json(appData);
    }
  } catch (e) {
    console.log(e);
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.get("/subscription/:id", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  id = req.params.id;
  try {
    connect = await database.connection.getConnection();
    const [subscription] = await connect.query(
      "SELECT * FROM subscription where id = ?",
      [id]
    );
    if (subscription.length) {
      appData.status = true;
      appData.data = subscription;
      res.status(200).json(appData);
    } else {
      appData.error = "Данные для входа введены неверно";
      res.status(400).json(appData);
    }
  } catch (e) {
    console.log(e);
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.get("/user/subscription/:id/:userid", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  id = req.params.id;
  userid = req.params.userid;
  try {
    connect = await database.connection.getConnection();
    const [subscription] = await connect.query(
      "SELECT  subscription.name, subscription.value,  subscription.duration, users_list.from_subscription, users_list.to_subscription   FROM  subscription  JOIN  users_list ON   subscription.id = users_list.subscription_id  WHERE  subscription.id =? AND users_list.id = ?",
      [id, userid]
    );
    if (subscription.length) {
      appData.status = true;
      appData.data = subscription;
      res.status(200).json(appData);
    } else {
      appData.error = "Данные для входа введены неверно";
      res.status(400).json(appData);
    }
  } catch (e) {
    console.log(e);
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.put("/subscription/:id", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const { id } = req.params;
    const { name, value, duration } = req.body;
    if (!id || !name || !value || !duration) {
      appData.error = "All fields are required";
      return res.status(400).json(appData);
    }
    const [rows] = await connect.query(
      `UPDATE subscription SET name = ?, value = ? , duration = ? WHERE id = ?`,
      [name, value, duration, id]
    );
    if (rows.affectedRows > 0) {
      appData.status = true;
      return res.status(200).json(appData);
    } else {
      appData.error = "No records were updated";
      return res.status(404).json(appData);
    }
  } catch (err) {
    appData.error = "Internal error";
    res.status(500).json(appData);
  } finally {
    if (connect) {
      connect.release(); // Release the connection when done
    }
  }
});

admin.delete("/subscription/:id", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const { id } = req.params;
    if (!id) {
      appData.error("Требуется идентификатор подписки");
      res.status(400).json(appData);
    }
    const [rows] = await connect.query(
      "DELETE FROM subscription WHERE id = ?",
      [id]
    );
    if (rows.affectedRows) {
      appData.status = true;
      res.status(200).json(appData);
    }
  } catch (err) {
    console.log(err);
    appData.error = "Internal error";
    res.status(403).json(appData);
  }
});

admin.post("/addDriverSubscription", async (req, res) => {
  let connect,
    appData = { status: false },
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  const { user_id, subscription_id, phone } = req.body;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_list WHERE phone = ? AND verify = 1 AND deleted = 1",
      [phone]
    );
    if (rows.length == 0) {
      appData.error = " пользователь не найден или заблокирован";
      appData.status = false;
      res.status(400).json(appData);
    } else {
      const [user] = await connect.query(
        "SELECT * FROM users_list WHERE to_subscription > CURDATE() AND id = ?",
        [user_id]
      );
      if (user.length > 0) {
        appData.error = "Пользователь уже имеет подписку";
        appData.status = false;
        res.status(400).json(appData);
      } else {
        const [paymentUser] = await connect.query(
          "SELECT * FROM payment where  userid = ? ",
          [user_id]
        );
        if (paymentUser.length > 0) {
          const [subscription] = await connect.query(
            "SELECT * FROM subscription where id = ? ",
            [subscription_id]
          );
          let valueofPayment;
          if (subscription[0].duration == 1) {
            valueofPayment = 80000;
          } else if (subscription[0].duration == 3) {
            valueofPayment = 180000;
          }
          if (subscription[0].duration == 12) {
            valueofPayment = 570000;
          }
          const [withdrawals] = await connect.query(
            `SELECT amount from driver_withdrawal where driver_id = ?`,
            [user_id]
          );
          const [activeBalance] = await connect.query(
            `SELECT amount from secure_transaction where dirverid = ? and status = 2`,
            [user_id]
          );
          const [subscriptionPayment] = await connect.query(
            `SELECT id, amount from subscription_transaction where userid = ? `,
            [user_id]
          );
          const [payments] = await connect.query(
            "SELECT amount FROM payment WHERE userid = ? and status = 1 and date_cancel_time IS NULL",
            [user_id]
          );
          const totalWithdrawalAmount = withdrawals.reduce(
            (accumulator, secure) => accumulator + +Number(secure.amount),
            0
          );
          const totalActiveAmount = activeBalance.reduce(
            (accumulator, secure) => accumulator + +Number(secure.amount),
            0
          );
          const totalPayments = payments.reduce(
            (accumulator, secure) => accumulator + +Number(secure.amount),
            0
          );
          const totalSubscriptionPayment = subscriptionPayment.reduce(
            (accumulator, subPay) => {
              return accumulator + Number(subPay.amount);
            },
            0
          );
          let balance =
            totalActiveAmount +
            (totalPayments - totalSubscriptionPayment) -
            totalWithdrawalAmount;

          // paymentUser active balance
          if (Number(balance) >= Number(valueofPayment)) {
            let nextMonth = new Date(
              new Date().setMonth(
                new Date().getMonth() + subscription[0].duration
              )
            );
            const [userUpdate] = await connect.query(
              "UPDATE users_list SET subscription_id = ?, from_subscription = ? , to_subscription=?  WHERE id = ?",
              [subscription_id, new Date(), nextMonth, user_id]
            );
            if (userUpdate.affectedRows == 1) {
              const subscription_transaction = await connect.query(
                "INSERT INTO subscription_transaction SET userid = ?, subscription_id = ?, phone = ?, amount = ?, admin_id = ?",
                [user_id, subscription_id, phone, valueofPayment, userInfo.id]
              );
              if (subscription_transaction.length > 0) {
                appData.status = true;
                res.status(200).json(appData);
              }
            } else {
              appData.error = "Невозможно обновить данные пользователя";
              appData.status = false;
              res.status(400).json(appData);
            }
          } else {
            appData.error = "Недостаточно средств на балансе";
            appData.status = false;
            res.status(400).json(appData);
          }
        } else {
          appData.error = " Не найден Пользователь";
          appData.status = false;
          res.status(400).json(appData);
        }
      }
    }
  } catch (e) {
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.get("/searchDriver/:driverId", async (req, res) => {
  const { driverId } = req.params;
  let connect,
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT id, phone, name FROM users_list where id = ? ",
      [driverId]
    );
    if (rows.length > 0) {
      const [withdrawalsProccess] = await connect.query(
        `SELECT amount from driver_withdrawal where driver_id = ? and status = 0`,
        [rows[0]?.id]
      );
      const [withdrawals] = await connect.query(
        `SELECT amount from driver_withdrawal where driver_id = ?`,
        [rows[0]?.id]
      );
      const [frozenBalance] = await connect.query(
        `SELECT amount from secure_transaction where dirverid = ? and status <> 2`,
        [rows[0]?.id]
      );
      const [activeBalance] = await connect.query(
        `SELECT amount from secure_transaction where dirverid = ? and status = 2`,
        [rows[0]?.id]
      );
      const [subscriptionPayment] = await connect.query(
        `SELECT id, amount from subscription_transaction where userid = ? and  COALESCE(agent_id, admin_id) IS NULL `,
        [rows[0]?.id]
      );
      const [payments] = await connect.query(
        "SELECT amount FROM payment WHERE userid = ? and status = 1 and date_cancel_time IS NULL",
        [rows[0].id]
      );
      const totalWithdrawalAmountProcess = withdrawalsProccess.reduce(
        (accumulator, secure) => accumulator + +Number(secure.amount),
        0
      );
      const totalWithdrawalAmount = withdrawals.reduce(
        (accumulator, secure) => accumulator + +Number(secure.amount),
        0
      );
      const totalFrozenAmount = frozenBalance.reduce(
        (accumulator, secure) => accumulator + +Number(secure.amount),
        0
      );
      const totalActiveAmount = activeBalance.reduce(
        (accumulator, secure) => accumulator + +Number(secure.amount),
        0
      );
      const totalPayments = payments.reduce(
        (accumulator, secure) => accumulator + +Number(secure.amount),
        0
      );
      const totalSubscriptionPayment = subscriptionPayment.reduce(
        (accumulator, subPay) => {
          return accumulator + Number(subPay.amount);
        },
        0
      );
      appData.data = rows[0];
      appData.data.balance =
        totalActiveAmount +
        (totalPayments - totalSubscriptionPayment) -
        totalWithdrawalAmount;
      appData.data.balance_in_proccess = totalWithdrawalAmountProcess;
      appData.data.balance_off = totalFrozenAmount ? totalFrozenAmount : 0;
      appData.status = true;
      res.status(200).json(appData);
    } else {
      appData.error = "Не найден платный драйвер";
      appData.status = false;
      res.status(400).json(appData);
    }
  } catch (e) {
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.get("/payment/:userId", async (req, res) => {
  let connect,
    appData = { status: false };
  const { userId } = req.params;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT  * from payment where userid=? ",
      [userId]
    );
    if (rows.length > 0) {
      appData.data = rows;
      appData.status = true;
      res.status(200).json(appData);
    } else {
      // appData.error = "Драйвер не найден";
      appData.status = false;
      res.status(400).json(appData);
    }
  } catch (e) {
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.get("/paymentFullBalance/:userId", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  const { userId } = req.params;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT id, phone, name FROM users_list WHERE id = ?",
      [userId]
    );
    if (rows.length) {
      const [withdrawalsProccess] = await connect.query(
        `SELECT amount from driver_withdrawal where driver_id = ? and status = 0`,
        [rows[0]?.id]
      );
      const [withdrawals] = await connect.query(
        `SELECT amount from driver_withdrawal where driver_id = ?`,
        [rows[0]?.id]
      );
      const [frozenBalance] = await connect.query(
        `SELECT amount from secure_transaction where dirverid = ? and status <> 2`,
        [rows[0]?.id]
      );
      const [activeBalance] = await connect.query(
        `SELECT amount from secure_transaction where dirverid = ? and status = 2`,
        [rows[0]?.id]
      );
      // `SELECT id, amount
      // FROM subscription_transaction
      // WHERE userid = ?
      //AND COALESCE(agent_id, admin_id) IS NULL

      const [subscriptionPayment] = await connect.query(
        `SELECT id, amount, agent_id, admin_id
        FROM subscription_transaction
        WHERE userid = ? AND COALESCE(agent_id, admin_id) IS NULL;
        `,
        [rows[0]?.id]
      );
      const [payments] = await connect.query(
        "SELECT amount FROM payment WHERE userid = ? and status = 1 and date_cancel_time IS NULL",
        [rows[0].id]
      );
      const totalWithdrawalAmountProcess = withdrawalsProccess.reduce(
        (accumulator, secure) => accumulator + Number(secure.amount),
        0
      );
      const totalWithdrawalAmount = withdrawals.reduce(
        (accumulator, secure) => accumulator + Number(secure.amount),
        0
      );
      const totalFrozenAmount = frozenBalance.reduce(
        (accumulator, secure) => accumulator + Number(secure.amount),
        0
      );
      const totalActiveAmount = activeBalance.reduce(
        (accumulator, secure) => accumulator + Number(secure.amount),
        0
      );
      const totalPayments = payments.reduce(
        (accumulator, secure) => accumulator + Number(secure.amount),
        0
      );
      const totalSubscriptionPayment = subscriptionPayment.reduce(
        (accumulator, subPay) => {
          return accumulator + Number(subPay.amount);
        },
        0
      );
      appData.data = rows[0];
      appData.data.balance =
        totalActiveAmount +
        (totalPayments - totalSubscriptionPayment) -
        totalWithdrawalAmount;
      appData.data.balance_in_proccess = totalWithdrawalAmountProcess;
      appData.data.balance_off = totalFrozenAmount ? totalFrozenAmount : 0;
      appData.status = true;
      res.status(200).json(appData);
    } else {
      res.status(200).json(appData);
    }
  } catch (err) {
    console.log(err);
    appData.message = err.message;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.post("/payment/history", async (req, res) => {
  let connect,
    appData = { status: false };
  const { userid, from, limit } = req.body;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT  * from payment where userid=?  ORDER BY id DESC LIMIT ?, ?",
      [userid, from, limit]
    );
    if (rows.length > 0) {
      appData.data = rows;
      appData.status = true;
      res.status(200).json(appData);
    } else {
      // appData.error = "Драйвер не найден";
      appData.status = false;
      res.status(200).json(appData);
    }
  } catch (e) {
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.post("/driver_withdrawal/history", async (req, res) => {
  let connect,
    appData = { status: false };
  const { driver_id, from, limit } = req.body;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT  * from driver_withdrawal where driver_id=? ORDER BY id DESC LIMIT ?, ?",
      [driver_id, from, limit]
    );
    if (rows.length > 0) {
      appData.data = rows;
      appData.status = true;
      res.status(200).json(appData);
    } else {
      // appData.error = "Драйвер не найден";
      appData.status = false;
      res.status(200).json(appData);
    }
  } catch (e) {
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.get("/searchdriverAgentAdmin/:driverId", async (req, res) => {
  let connect,
    appData = { status: false };
  const { driverId, agentId } = req.params;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT phone, name  FROM users_list WHERE user_type = 1 AND id = ? ",
      [driverId]
    );
    if (rows.length > 0) {
      appData.data = rows[0];
      appData.status = true;
      res.status(200).json(appData);
    } else {
      appData.error = "Нет такого Водитель";
      appData.status = false;
      res.status(400).json(appData);
    }
  } catch (e) {
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.get("/searchdriverAgent/:driverId/:agentId", async (req, res) => {
  let connect,
    appData = { status: false };
  const { driverId, agentId } = req.params;
  try {
    connect = await database.connection.getConnection();
    if (Number(agentId) !== 0) {
      const [rows] = await connect.query(
        "SELECT phone, name  FROM users_list WHERE user_type = 1 AND id = ? AND agent_id =?",
        [driverId, agentId]
      );
      if (rows.length > 0) {
        appData.data = rows[0];
        appData.status = true;
        res.status(200).json(appData);
      } else {
        appData.error = "Нет такого Водитель";
        appData.status = false;
        res.status(400).json(appData);
      }
    } else {
      const [rows] = await connect.query(
        "SELECT phone, name  FROM users_list WHERE user_type = 1 AND id = ? ",
        [driverId]
      );
      if (rows.length > 0) {
        appData.data = rows[0];
        appData.status = true;
        res.status(200).json(appData);
      } else {
        appData.error = "Нет такого Водитель";
        appData.status = false;
        res.status(400).json(appData);
      }
    }
  } catch (e) {
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.post("/connectDriverToAgent", async (req, res) => {
  let connect,
    appData = { status: false };
  const { user_id, agent_id } = req.body;
  try {
    connect = await database.connection.getConnection();
    const [driver] = await connect.query(
      "SELECT * FROM users_list where id=? AND user_type = 1 AND ban <> 1 AND deleted <> 1 ",
      [user_id]
    );
    if (!driver[0].agent_id) {
      const [userUpdate] = await connect.query(
        "UPDATE users_list SET agent_id = ? WHERE id = ?",
        [agent_id, user_id]
      );
      if (userUpdate.affectedRows == 1) {
        appData.status = true;
        res.status(200).json(appData);
      } else {
        appData.error = "Невозможно обновить данные пользователя";
        appData.status = false;
        res.status(400).json(appData);
      }
    } else {
      appData.error = "У этого водителя есть агент";
      appData.status = false;
      res.status(400).json(appData);
    }
  } catch (e) {
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.post("/addUserByAgent", async (req, res) => {
  let connect,
    { agent_id, subscription_id, user_id, phone } = req.body,
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    phone = phone.replace(/[^0-9, ]/g, "").replace(/ /g, "");
    const [rows] = await connect.query(
      "SELECT * FROM users_contacts WHERE text = ? ",
      [phone]
    );
    if (rows.length < 0) {
      appData.error = "Драйвер не найден";
      appData.status = false;
      res.status(400).json(appData);
    } else {
      const [user] = await connect.query(
        "SELECT * FROM users_list WHERE to_subscription > CURDATE() AND id = ?",
        [user_id]
      );
      if (user.length > 0) {
        appData.error = "Пользователь уже имеет подписку";
        appData.status = false;
        res.status(400).json(appData);
      } else {
        const [subscription] = await connect.query(
          "SELECT * FROM subscription where id = ? ",
          [subscription_id]
        );
        const [agentBalance] = await connect.query(
          `SELECT 
            COALESCE((SELECT SUM(amount) FROM agent_transaction WHERE agent_id = ? AND type = 'Пополнение'), 0) - 
            COALESCE((SELECT SUM(amount) FROM agent_transaction WHERE agent_id = ? AND type = 'Подписка'), 0) AS total_amount
          `,
          [agent_id, agent_id]
        );
        if (agentBalance.length) {
          if (subscription[0].duration === 1) {
            let paymentValue = 80000;
            if (Number(agentBalance[0].total_amount) >= Number(paymentValue)) {
              const insertResult = await connect.query(
                "INSERT INTO agent_transaction SET  agent_id = ?, amount = ?, created_at = ?, type = 'Подписка'",
                [agent_id, paymentValue, new Date()]
              );
              if (insertResult) {
                let nextthreeMonth = new Date(
                  new Date().setMonth(
                    new Date().getMonth() + subscription[0].duration
                  )
                );
                const subscription_transaction = await connect.query(
                  "INSERT INTO subscription_transaction SET userid = ?, subscription_id = ?, phone = ?, amount = ?, agent_id = ?",
                  [user_id, subscription_id, phone, paymentValue, agent_id]
                );

                if (subscription_transaction.length > 0) {
                  const [edit] = await connect.query(
                    "UPDATE users_list SET subscription_id = ? , from_subscription = ? , to_subscription=?  WHERE id =?",
                    [subscription_id, new Date(), nextthreeMonth, user_id]
                  );
                  appData.data = edit;
                  appData.status = true;
                  res.status(200).json(appData);
                } else {
                  appData.error = "не могу добавить транзакцию подписки";
                  appData.status = false;
                  res.status(400).json(appData);
                }
              } else {
                appData.error = "не могу добавить транзакцию подписки";
                appData.status = false;
                res.status(400).json(appData);
              }
            } else {
              appData.error = "Баланса недостаточно";
              appData.status = false;
              res.status(400).json(appData);
            }
          } else if (subscription[0].duration === 3) {
            let paymentValue = 180000;
            if (Number(agentBalance[0].total_amount) >= Number(paymentValue)) {
              const insertResult = await connect.query(
                "INSERT INTO agent_transaction SET  agent_id = ?, amount = ?, created_at = ?, type = 'Подписка'",
                [agent_id, paymentValue, new Date()]
              );
              if (insertResult) {
                let nextthreeMonth = new Date(
                  new Date().setMonth(
                    new Date().getMonth() + subscription[0].duration
                  )
                );
                const subscription_transaction = await connect.query(
                  "INSERT INTO subscription_transaction SET userid = ?, subscription_id = ?, phone = ?, amount = ?, agent_id = ?",
                  [user_id, subscription_id, phone, paymentValue, agent_id]
                );
                if (subscription_transaction.length > 0) {
                  const [edit] = await connect.query(
                    "UPDATE users_list SET subscription_id = ? , from_subscription = ? , to_subscription=?  WHERE id =?",
                    [subscription_id, new Date(), nextthreeMonth, user_id]
                  );
                  appData.data = edit;
                  appData.status = true;
                  res.status(200).json(appData);
                } else {
                  appData.error = "не могу добавить транзакцию подписки";
                  appData.status = false;
                  res.status(400).json(appData);
                }
              } else {
                appData.error = "не могу добавить транзакцию подписки";
                appData.status = false;
                res.status(400).json(appData);
              }
            } else {
              appData.error = "Баланса недостаточно";
              appData.status = false;
              res.status(400).json(appData);
            }
          } else if (subscription[0].duration === 12) {
            let paymentValue = 570000;
            if (Number(agentBalance[0].total_amount) >= Number(paymentValue)) {
              const insertResult = await connect.query(
                "INSERT INTO agent_transaction SET  agent_id = ?, amount = ?, created_at = ?, type = 'Подписка'",
                [agent_id, paymentValue, new Date()]
              );
              if (insertResult) {
                let nextthreeMonth = new Date(
                  new Date().setMonth(
                    new Date().getMonth() + subscription[0].duration
                  )
                );
                const subscription_transaction = await connect.query(
                  "INSERT INTO subscription_transaction SET userid = ?, subscription_id = ?, phone = ?, amount = ?, agent_id = ?",
                  [user_id, subscription_id, phone, paymentValue, agent_id]
                );
                if (subscription_transaction.length > 0) {
                  const [edit] = await connect.query(
                    "UPDATE users_list SET subscription_id = ? , from_subscription = ? , to_subscription=? WHERE id =?",
                    [subscription_id, new Date(), nextthreeMonth, user_id]
                  );
                  appData.data = edit;
                  appData.status = true;
                  res.status(200).json(appData);
                } else {
                  appData.error = "не могу добавить транзакцию подписки";
                  appData.status = false;
                  res.status(400).json(appData);
                }
              } else {
                appData.error = "не могу добавить транзакцию подписки";
                appData.status = false;
                res.status(400).json(appData);
              }
            } else {
              appData.error = "Баланса недостаточно";
              appData.status = false;
              res.status(400).json(appData);
            }
          }
        }
      }
    }
    // res.status(200).json(appData);
  } catch (e) {
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.post("/subscription-history", async (req, res) => {
  let connect,
    appData = { status: false };
  const { agent_id } = req.body;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      `SELECT 
      id,
      (SELECT u.name FROM users_list u WHERE u.id = t.agent_id) AS agent_name,
      (SELECT u.name FROM users_list u WHERE u.id = t.admin_id) AS admin_name,
      amount,
      type,
      created_at,
      '' as user_name,
      '' as userid
  FROM 
      agent_transaction t
  WHERE 
      t.agent_id = ? 
      AND
      t.type != 'Подписка'
  UNION ALL 
  SELECT 
      id,
      (SELECT u.name FROM users_list u WHERE u.id = s.agent_id) AS agent_name,  
      '' as admin_name,
      amount,
      'Подписка' as type,
      created_at,
      (SELECT u.name FROM users_list u WHERE u.id = s.userid) AS user_name,
      s.userid
  FROM 
      subscription_transaction s 
  WHERE 
      s.agent_id = ? 
  `,
      [agent_id, agent_id]
    );
    if (rows.length > 0) {
      appData.data = rows;
      appData.status = true;
      res.status(200).json(appData);
    } else {
      appData.status = false;
      appData.error = "У нас нет транзакции";
      res.status(400).json(appData);
    }
  } catch (e) {
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.get("/services/:id", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    const { id } = req.params;
    connect = await database.connection.getConnection();
    const [subscription] = await connect.query(
      "SELECT * FROM services where id = ?",
      [id]
    );
    if (subscription.length) {
      appData.status = true;
      appData.data = subscription;
      res.status(200).json(appData);
    } else {
      appData.error = "Услуги не найдены";
      res.status(400).json(appData);
    }
  } catch (e) {
    console.log(e);
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.put("/services/:id", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const { id } = req.params;
    const { name, price_uzs, price_kzs, rate } = req.body;
    if (!id || !name || !price_uzs || !price_kzs || !rate) {
      appData.error = "All fields are required";
      return res.status(400).json(appData);
    }
    const [rows] = await connect.query(
      `UPDATE services SET name = ? , price_uzs = ?, price_kzs = ?, rate = ? WHERE id = ?`,
      [name, price_uzs, price_kzs, rate, id]
    );
    if (rows.affectedRows > 0) {
      appData.status = true;
      socket.updateAllMessages("update-services", "1");
      return res.status(200).json(appData);
    } else {
      appData.error = "Ни одна запись не была обновлена";
      return res.status(404).json(appData);
    }
  } catch (err) {
    appData.error = "Internal error";
    res.status(500).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.delete("/services/:id", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const { id } = req.params;
    const [rows] = await connect.query("DELETE FROM services WHERE id = ?", [
      id,
    ]);
    if (rows.affectedRows) {
      appData.status = true;
      res.status(200).json(appData);
    }
  } catch (err) {
    console.log(err);
    appData.error = "Internal error";
    res.status(403).json(appData);
  }
});

admin.post("/services", async (req, res) => {
  let connect,
    name = req.body.name,
    price_uzs = req.body.price_uzs,
    price_kzs = req.body.price_kzs,
    rate = req.body.rate,
    appData = { status: false };
  try {
    if (!name || !price_uzs || !price_kzs || !rate) {
      appData.error = "All fields are required";
      return res.status(400).json(appData);
    }
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM services where name = ?",
      [name]
    );
    if (rows.length > 0) {
      appData.error = "если уже есть услуги.";
      res.status(400).json(appData);
    } else {
      const [subscription] = await connect.query(
        "INSERT INTO services SET name = ?, price_uzs = ?, price_kzs = ?, rate = ?",
        [name, price_uzs, price_kzs, rate]
      );
      appData.status = true;
      appData.data = subscription;
      res.status(200).json(appData);
    }
  } catch (e) {
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.get("/services", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [subscription] = await connect.query("SELECT * FROM services");
    if (subscription.length) {
      appData.status = true;
      appData.data = subscription;
      res.status(200).json(appData);
    } else {
      appData.error = "Услуги не найдены";
      res.status(400).json(appData);
    }
  } catch (e) {
    console.log(e);
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.post("/addDriverServices", async (req, res) => {
  let connect,
    appData = { status: false };
  const { user_id, phone, services } = req.body;
  try {
    if (!services) {
      appData.error = "Необходимо оформить подписку";
      return res.status(400).json(appData);
    }
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_contacts WHERE text = ? AND verify = 1",
      [phone]
    );
    if (rows.length < 1) {
      appData.error = " Не найден Пользователь";
      appData.status = false;
      res.status(400).json(appData);
    } else {
      const [paymentUser] = await connect.query(
        "SELECT * FROM alpha_payment where  userid = ? ",
        [user_id]
      );
      const totalPaymentAmount = paymentUser.reduce(
        (accumulator, secure) => accumulator + Number(secure.amount),
        0
      );

      const [paymentTransaction] = await connect.query(
        "SELECT * FROM services_transaction where  userid = ? AND status <> 2 ",
        [user_id]
      );

      const totalPaymentAmountTransaction = paymentTransaction.reduce(
        (accumulator, secure) => accumulator + Number(secure.price_uzs),
        0
      );

      const totalAmount = services.reduce(
        (accumulator, secure) => accumulator + Number(secure.price_uzs),
        0
      );

      let balance = totalPaymentAmount - totalPaymentAmountTransaction;
      if (balance >= totalAmount) {
        const [editUser] = await connect.query(
          "UPDATE users_list SET is_service = 1  WHERE id = ?",
          [user_id]
        );
        if (editUser.affectedRows > 0) {
          const insertValues = await Promise.all(
            services.map(async (service) => {
              try {
                const [result] = await connect.query(
                  "SELECT * FROM services WHERE id = ?",
                  [service.service_id]
                );
                if (result.length === 0) {
                  throw new Error(
                    `Service with ID ${service.service_id} not found.`
                  );
                }
                return [
                  user_id,
                  service.service_id,
                  result[0].name,
                  service.price_uzs,
                  service.price_kzs,
                  service.rate,
                  0
                ];
              } catch (error) {
                console.error("Error occurred while fetching service:", error);
              }
            })
          );
          const sql =
            "INSERT INTO services_transaction (userid, service_id, service_name, price_uzs, price_kzs, rate, status) VALUES ?";
          const [result] = await connect.query(sql, [insertValues]);
          if (result.affectedRows > 0) {
            appData.status = true;
            socket.updateAllMessages("update-alpha-balance", "1");
            res.status(200).json(appData);
          }
        } else {
          appData.error = "Пользователь не может обновить";
          appData.status = false;
          res.status(400).json(appData);
        }
      } else {
        appData.error = "Недостаточно средств на балансе";
        appData.status = false;
        res.status(400).json(appData);
      }
    }
  } catch (e) {
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.get("/alpha-payment/:userid", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    const { userid } = req.params;
    connect = await database.connection.getConnection();
    const [payment] = await connect.query(
      `SELECT *  FROM alpha_payment JOIN users_list ON alpha_payment.userid = users_list.id
         WHERE alpha_payment.userid = ? `,
      [userid]
    );
    const [paymentUser] = await connect.query(
      "SELECT * FROM alpha_payment where  userid = ? ",
      [userid]
    );

    const totalPaymentAmount = paymentUser.reduce(
      (accumulator, secure) => accumulator + Number(secure.amount),
      0
    );

    const [paymentTransaction] = await connect.query(
      "SELECT * FROM services_transaction where  userid = ? AND status <> 2",
      [userid]
    );

    const totalPaymentAmountTransaction = paymentTransaction.reduce(
      (accumulator, secure) => accumulator + Number(secure.price_kzs),
      0
    );
    let balance =
      Number(totalPaymentAmount) - Number(totalPaymentAmountTransaction);
    if (payment.length) {
      appData.status = true;
      appData.data = { user: payment[0], total_amount: balance };
      res.status(200).json(appData);
    } else {
      appData.error = "Пользователь не оплатил услуги Тирго";
      res.status(400).json(appData);
    }
  } catch (e) {
    console.log(e);
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.post("/services-transaction", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  const { from, limit } = req.body;
  try {
    connect = await database.connection.getConnection();
    const [services_transaction] = await connect.query(
      `SELECT  
      st.id,
      st.userid,
      st.service_id,
      COALESCE(
          st.service_name,
          (SELECT name FROM services WHERE id = st.service_id)
      ) AS name,
      st.price_uzs,
      st.price_kzs,
      st.rate,
      status,
      st.createAt
  FROM 
      services_transaction st
  ORDER BY 
      st.id DESC 
  LIMIT 
      ?, ?
    `,
      [from, limit]
    );
    if (services_transaction.length) {
      appData.status = true;
      appData.data = services_transaction;
      res.status(200).json(appData);
    } else {
      appData.error = "Транзакция не найдена";
      res.status(400).json(appData);
    }
  } catch (e) {
    console.log(e);
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.post("/services-transaction/user", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  const { userid, from, limit } = req.body;
  try {
    connect = await database.connection.getConnection();
    const [services_transaction] = await connect.query(
      `SELECT 
    id,
    userid,
    service_id,
    COALESCE(
      st.service_name,
      (SELECT name FROM services WHERE id = st.service_id)
  ) AS name,
    price_uzs,
    price_kzs,
    rate,
    status,
    createAt
    FROM services_transaction st where userid = ?
    AND status <> 2
    ORDER BY id DESC LIMIT ?, ?`,
      [userid, from, limit]
    );
    if (services_transaction.length) {
      appData.status = true;
      appData.data = services_transaction;
      res.status(200).json(appData);
    } else {
      appData.error = "Транзакция не найдена";
      res.status(400).json(appData);
    }
  } catch (e) {
    console.log(e);
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.get("/curence/:key/:value", async (req, res) => {
  let appData = { status: false, timestamp: new Date().getTime() };
  if (req.params.key == "UZS") {
    let result = await axios.get(
      "https://cbu.uz/ru/arkhiv-kursov-valyut/json/"
    );
    result = result.data.find((res) => res.Ccy == "KZT");
    appData.data = req.params.value / result?.Rate;
    appData.status = true;
    res.status(200).json(appData);
  } else {
    try {
      let result = await axios.get(
        "https://cbu.uz/ru/arkhiv-kursov-valyut/json/"
      );
      result = result.data.find((res) => res.Ccy == req.params.key);
      appData.data = req.params.value * result?.Rate;
      appData.status = true;
      res.status(200).json(appData);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }
});

admin.get("/curence/course", async (req, res) => {
  let appData = { status: false, timestamp: new Date().getTime() };
  try {
    let result = await axios.get(
      "https://cbu.uz/ru/arkhiv-kursov-valyut/json/"
    );
    result = result.data.find((res) => res.Ccy == "KZT");
    appData.data = result?.Rate;
    appData.status = true;
    res.status(200).json(appData);
  } catch (error) {
    console.error("Error fetching data:", error);
  }
});

admin.get("/services-transaction/count", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [services_transaction] = await connect.query(
      `SELECT count(*) as count FROM  services_transaction  where status = 0`
    );
    if (services_transaction.length) {
      appData.status = true;
      appData.data = services_transaction[0];
      res.status(200).json(appData);
    } else {
      appData.error = "Транзакция не найдена";
      res.status(400).json(appData);
    }
  } catch (e) {
    console.log(e);
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

admin.post("/services-transaction/status", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  const { id } = req.body;
  try {
    connect = await database.connection.getConnection();
    const [updateResult] = await connect.query(
      "UPDATE services_transaction SET status = 2 WHERE id = ?",
      [id]
    );
    if (updateResult.affectedRows > 0) {
      appData.status = true;
      res.status(200).json(appData);
    } else {
      appData.error = "История транзакций не изменилась";
      res.status(400).json(appData);
    }
  } catch (e) {
    console.log(e);
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
admin.post("/services-transaction/status/by", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  const { id, status } = req.body;
  try {
    connect = await database.connection.getConnection();
    const [updateResult] = await connect.query(
      "UPDATE services_transaction SET status = ? WHERE id = ?",
      [status, id]
    );
    if (updateResult.affectedRows > 0) {
      appData.status = true;
      res.status(200).json(appData);
    } else {
      appData.error = "История транзакций не изменилась";
      res.status(400).json(appData);
    }
  } catch (e) {
    console.log(e);
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

module.exports = admin;
