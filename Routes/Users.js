const { app } = require("firebase-admin");
const Minio = require("minio");
const express = require("express"),
  users = express.Router(),
  database = require("../Database/database"),
  cors = require("cors"),
  rp = require("request-promise"),
  socket = require("../Modules/Socket"),
  push = require("../Modules/Push"),
  jwt = require("jsonwebtoken"),
  multer = require("multer"),
  fs = require("fs"),
  path = require("path"),
  sharp = require("sharp"),
  sendpulse = require("sendpulse-api"),
  crypto = require("crypto"),
  parseIp = (req) =>
    (typeof req.headers["x-forwarded-for"] === "string" &&
      req.headers["x-forwarded-for"].split(",").shift()) ||
    (req.connection && req.connection.remoteAddress) ||
    (req.socket && req.socket.remoteAddress);
const axios = require("axios");
const { finishOrderDriver } = require("./rabbit");
const { userInfo } = require("os");
const { tirgoBalanceCurrencyCodes } = require("../constants");
const Push = require("../Modules/Push");
// Multer configuration
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, "uploads/"); // Store files in the 'uploads' folder
//   },
//   filename: function (req, file, cb) {
//     cb(null, file.originalname);
//   },
// });
// const upload = multer({ storage: storage });
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

let token;

let API_USER_ID = "8b633b534e645924569a7fb772ee1546";
let API_SECRET = "e16dac0175e1f9a1d2641f435ab915bc";
let TOKEN_STORAGE = "/tmp/";

users.use(cors());
users.post("/completeClickPay", async function (req, res) {
  let connect,
    merchant_prepare_id = "",
    data = [],
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    appData.error = 0;
    appData.error_note = "success";
    appData.click_trans_id = req.body.click_trans_id;
    appData.merchant_trans_id = req.body.merchant_trans_id;
    merchant_prepare_id = null;
    const [rows] = await connect.query(
      `SELECT p.*, su.chat_id FROM payment p
      LEFT JOIN services_bot_users su on su.user_id = p.userid
      WHERE click_trans_id = ? LIMIT 1`,
      [req.body.click_trans_id]
    );
    if (rows.length > 0 && rows[0].status === 0 && +req.body.error >= 0) {
      await connect.query("UPDATE payment SET status = 1 WHERE id = ?", [
        rows[0].id,
      ]);
      const [insert] = await connect.query(
        "UPDATE users_list SET balance = balance + ? WHERE id = ?",
        [rows[0].amount, +req.body.merchant_trans_id]
      );
      if (insert.affectedRows > 0) {

        const [currency] = await connect.query(`
        SELECT * from tirgo_balance_currency WHERE code = ${tirgoBalanceCurrencyCodes.uzs} 
        `);

        await connect.query(`
        INSERT INTO tir_balance_exchanges SET user_id = ?, currency_name = ?, rate_uzs = ?, rate_kzt = ?, amount_uzs = ?, amount_kzt = ?, amount_tir = ?, balance_type = 'tirgo', click_id = ?, created_by_id = ?
        `, [+rows[0]?.userid, currency[0]?.currency_name, currency[0]?.rate, 0, +rows[0].amount, 0, +rows[0].amount / currency[0]?.rate, rows[0].id, +rows[0]?.userid]);

        const [token] = await connect.query(
          "SELECT * FROM users_list WHERE id = ?",
          [+req.body.merchant_trans_id]
        );
        if (token.length) {
          if (token[0].token !== "" && token[0].token !== null) {
            push.send(
              token[0].token,
              "Пополнение баланса",
              "Ваш баланс успешно пополнен на сумму " + rows[0].amount,
              "",
              ""
            );

            socket.emit(14, 'service-status-change', JSON.stringify({ userChatId: rows[0].chat_id, text: `Вы пополнили Tirgo баланс на \n${rows[0].amount} ${currency[0]?.currency_name}\n${+rows[0].amount / currency[0]?.rate} tir` }));

            let valueofPayment = 0;
            let duration = 0;
            const [paymentUser] = await connect.query(
              `SELECT 
                  COALESCE((SELECT SUM(amount_tir) FROM tir_balance_exchanges WHERE user_id = ${+rows[0]?.userid} AND balance_type = 'tirgo'), 0) -
                  COALESCE((SELECT SUM(amount_tir) FROM tir_balance_transaction  WHERE deleted = 0 AND user_id = ${+rows[0]?.userid} AND transaction_type = 'subscription'), 0) AS tirgoBalance`
            );
            const tirCurrency = await connect.query(`SELECT id, currency_name, rate, code FROM tirgo_balance_currency WHERE code = ${tirgoBalanceCurrencyCodes.uzs}`);
            const [subscriptions] = await connect.query("SELECT * FROM subscription");
            const payAmount = +rows[0].amount + (+paymentUser[0]?.tirgoBalance * +tirCurrency[0]?.rate);
            let subscriptionId;

            for (let sub of subscriptions) {
              const subValue = +sub.value * +tirCurrency[0]?.rate;
              if (payAmount >= subValue && subValue > valueofPayment) {
                valueofPayment = subValue;
                duration = sub.duration;
                subscriptionId = sub.id;
              }
            }

            const [users] = await connect.query(
              "SELECT * FROM users_list where id = ?",
              [req.body.merchant_trans_id]
            );
            if (payAmount > valueofPayment) {
              let nextMonth = new Date(
                new Date().setMonth(
                  new Date().getMonth() + subscription[0].duration
                )
              );
              const [userUpdate] = await connect.query(
                "UPDATE users_list SET subscription_id = ?, from_subscription = ? , to_subscription=?  WHERE id = ?",
                [subscriptionId, new Date(), nextMonth, req.body.merchant_trans_id]
              );
              if (userUpdate.affectedRows == 1) {
                // const subscription_transaction = await connect.query(
                //   "INSERT INTO subscription_transaction SET userid = ?, subscription_id = ?, phone = ?, amount = ?",
                //   [
                //     req.body.merchant_trans_id,
                //     subscription[0].id,
                //     users[0].phone,
                //     valueofPayment,
                //   ]
                // );
                const [subscription_transaction] = await connect.query(`
                INSERT INTO tir_balance_transaction (user_id, subscription_id, created_by_id, transaction_type, amount) VALUES ?
              `, [req.body.merchant_trans_id, subscriptionId, req.body.merchant_trans_id, 'subscription', +rows[0].amount / currency[0]?.rate]);
                if (subscription_transaction.affectedRows) {
                }
              }
            }
          }
        }
        data = {
          userid: req.body.merchant_trans_id,
          amount: rows[0].amount,
        };
        socket.updatebalance("updatebalanceuser", data);
      }
    }
    res.status(200).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
users.post("/prepareClickPay", async function (req, res) {
  let connect,
    prepareid = Math.floor(10000000 + Math.random() * 89999999),
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    appData.error = req.body.error;
    appData.error_note = req.body.error_note;
    appData.click_trans_id = req.body.click_trans_id;
    appData.merchant_trans_id = req.body.merchant_trans_id;
    appData.merchant_prepare_id = prepareid;
    const [insert] = await connect.query(
      "INSERT INTO payment SET click_trans_id = ?,userid = ?,merchant_prepare_id = ?,error = ?,error_note = ?,amount = ?",
      [
        req.body.click_trans_id,
        req.body.merchant_trans_id,
        prepareid,
        req.body.error,
        req.body.error_note,
        req.body.amount,
      ]
    );
    if (insert.affectedRows > 0) {
      res.status(200).json(appData);
    }
  } catch (err) {
    appData.status = false;
    appData.error = err;
    appData.message = err.message;
    appData.data = "Неизвестная ошибка";
    res.status(200).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});


users.post("/alphaCompleteClickPay", async function (req, res) {
  let connect,
    merchant_prepare_id = "",
    data = [],
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    appData.error = 0;
    appData.error_note = "success";
    appData.click_trans_id = req.body.click_trans_id;
    appData.merchant_trans_id = req.body.merchant_trans_id;
    merchant_prepare_id = null;
    const [rows] = await connect.query(
      `SELECT ap.*, su.chat_id FROM alpha_payment ap
      LEFT JOIN services_bot_users su on su.user_id = ap.userid
      WHERE click_trans_id = ? LIMIT 1`,
      [req.body.click_trans_id]
    );
    console.log(rows.length, req.body.merchant_trans_id)
    console.log({ user: rows[0] })
    if (rows.length > 0 && rows[0].status === 0 && +req.body.error >= 0) {
      await connect.query("UPDATE alpha_payment SET status = 1 WHERE id = ?", [
        rows[0].id,
      ]);
      const [insert] = await connect.query(
        "UPDATE users_list SET balance = balance + ? WHERE id = ?",
        [rows[0].amount, +req.body.merchant_trans_id]
      );
      console.log({ amount: rows[0].amount })
      const [currency] = await connect.query(`
      SELECT * from tirgo_balance_currency WHERE code = ${tirgoBalanceCurrencyCodes.uzs} 
      `);

      await connect.query(`
      INSERT INTO tir_balance_exchanges SET user_id = ?, currency_name = ?, rate_uzs = ?, rate_kzt = ?, amount_uzs = ?, amount_kzt = ?, amount_tir = ?, balance_type = 'tirgo_service', click_id = ?, created_by_id = ?
      `, [+rows[0]?.userid, currency[0]?.currency_name, currency[0]?.rate, 0, +rows[0].amount, 0, +rows[0].amount / currency[0]?.rate, +rows[0]?.id, +rows[0]?.userid]);
      console.log({ chat_id: rows[0].chat_id })
      console.log(rows[0])
      socket.emit(14, 'service-status-change', JSON.stringify({ userChatId: rows[0].chat_id, text: `Вы пополнили TirgoService баланс на\n${rows[0].amount} ${currency[0]?.currency_name}\n${+rows[0].amount / currency[0]?.rate} tir` }));

      socket.updateAllMessages("update-alpha-balance", "1");
      if (insert.affectedRows > 0) {
        const [token] = await connect.query(
          "SELECT * FROM users_list WHERE id = ?",
          [+req.body.merchant_trans_id]
        );
        if (token.length) {
          if (token[0].token !== "" && token[0].token !== null) {
            // push.send(
            //   token[0].token,
            //   "Пополнение баланса",
            //   "Ваш баланс успешно пополнен на сумму " + rows[0].amount,
            //   "",
            //   ""
            // );
          }
        }
        data = {
          userid: req.body.merchant_trans_id,
          amount: rows[0].amount,
        };
        socket.updatebalance("updatebalanceuser", data);
      }
    }
    res.status(200).json(appData);
  } catch (err) {
    console.log(err)
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

users.post("/alphaPrepareClickPay", async function (req, res) {
  let connect,
    prepareid = Math.floor(10000000 + Math.random() * 89999999),
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    appData.error = req.body.error;
    appData.error_note = req.body.error_note;
    appData.click_trans_id = req.body.click_trans_id;
    appData.merchant_trans_id = req.body.merchant_trans_id;
    appData.merchant_prepare_id = prepareid;
    const [insert] = await connect.query(
      "INSERT INTO alpha_payment SET click_trans_id = ?,userid = ?,merchant_prepare_id = ?,error = ?,error_note = ?,amount = ?",
      [
        req.body.click_trans_id,
        req.body.merchant_trans_id,
        prepareid,
        req.body.error,
        req.body.error_note,
        req.body.amount,
      ]
    );
    if (insert.affectedRows > 0) {
      res.status(200).json(appData);
    }
  } catch (err) {
    console.log(err)
    appData.status = false;
    appData.error = err;
    appData.message = err.message;
    appData.data = "Неизвестная ошибка";
    res.status(200).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

users.get("/pushOne", async function (req, res) {
  let connect,
    header = "Test",
    text = "Test",
    comment = "Test",
    appData = { status: false };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_list WHERE token <> ? AND token is NOT NULL AND id = ?",
      ["", 4076]
    );
    for (let row of rows) {
      push.send(row.token, header, text, "", "");
    }
    appData.status = true;
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err.message;
    res.status(200).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
async function refreshTokenSmsEskiz() {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    options = {};
  try {
    connect = await database.connection.getConnection();
    const [row] = await connect.query(
      "SELECT * FROM config WHERE id = 1 LIMIT 1"
    );
    if (row.length) {
      options = {
        method: "PATCH",
        json: true,
        uri: "notify.eskiz.uz/api/auth/refresh",
        headers: {
          Authorization: "Bearer " + row[0].token_sms,
        },
      };
      const rp_res = await rp(options);
      if (rp_res.data) {
        await connect.query("UPDATE config SET token_sms = ? WHERE id = 1", [
          rp_res.data.token,
        ]);
      }
    }
  } catch (err) {
    appData.status = false;
    appData.data = "Неизвестная ошибка2";
  } finally {
    if (connect) {
      connect.release();
    }
  }
}
async function sendSmsGlobal(phone, code, country_code) {
  let connect;
  try {
    connect = await database.connection.getConnection();
    const [row] = await connect.query(
      "SELECT * FROM config WHERE id = 1 LIMIT 1"
    );
    const optionsRefresh = {
      method: "PATCH",
      uri: "https://notify.eskiz.uz/api/auth/refresh",
      json: true,
      headers: {
        Authorization: "Bearer " + row[0].token_sms,
      },
    };
    await rp(optionsRefresh);
    const optionsUpdate = {
      method: "POST",
      body: {
        email: "tirgolog@gmail.com",
        password: "G0ZwuvgWNTqesEjqrYzG9CuE4Gc3MFKiUhsppiNh",
      },
      json: true,
      uri: "https://notify.eskiz.uz/api/auth/login",
    };
    const rp_res_update = await rp(optionsUpdate);
    if (rp_res_update.data) {
      await connect.query("UPDATE config SET token_sms = ? WHERE id = 1", [
        rp_res_update.data.token,
      ]);
      const options = {
        method: "POST",
        uri: "https://notify.eskiz.uz/api/message/sms/send-global",
        json: true,
        body: {
          mobile_phone: phone,
          message: "Confirmation code " + code,
          country_code: country_code,
        },
        headers: {
          Authorization: "Bearer " + rp_res_update.data.token,
        },
      };
      const rp_res = await rp(options);
      return rp_res.status;
    }
  } catch (err) {
    return false;
  } finally {
    if (connect) {
      connect.release();
    }
  }
}
async function sendSmsPlayMobile(phone, code, country_code) {
  let options = {
    method: "POST",
    uri: "http://91.204.239.44/broker-api/send",
    json: true,
    body: {
      messages: [
        {
          recipient: "" + phone,
          "message-id": "a" + new Date().getTime().toString(),
          sms: {
            originator: "3700",
            content: {
              text: "Confirmation code " + code,
            },
          },
        },
      ],
    },
    headers: {
      Authorization:
        "Basic " + Buffer.from("tirgo:C63Fs89yuN").toString("base64"),
    },
  };
  console.log("a" + new Date().getTime().toString());
  try {
    console.log("before responce");
    let rp_res = await rp(options);
    console.log(rp_res, "responce");
    if (rp_res === "Request is received") {
      return "waiting";
    } else {
      return false;
    }
  } catch (err) {
    return false;
  } finally {
    console.log("finally");
  }
}

async function sendSmsOson(phone, code) {
  console.log(phone, "phone OSON");
  console.log(code, "phone code OSON");
  const txn_id = generateUniqueId();
  const str_hash = generateHash(
    txn_id,
    "tirgo",
    "TIRGO",
    phone,
    "f498f64594b4f0b844ba45b79d4d0d4f"
  );
  const message = "Confirmation code " + code;
  const params = {
    from: "TIRGO",
    phone_number: phone,
    msg: message,
    str_hash: str_hash,
    txn_id: txn_id,
    login: "tirgo",
  };
  let options = {
    method: "GET",
    uri: `https://api.osonsms.com/sendsms_v1.php?login=${params.login}&from=${params.from}&phone_number=${params.phone_number}&msg=${params.msg}&txn_id=${params.txn_id}&str_hash=${params.str_hash}`,
    json: false,
  };
  try {
    let rp_res = await rp(options);
    if (JSON.parse(rp_res).status == "ok") {
      return "waiting";
    } else {
      return false;
    }
  } catch (err) {
    return false;
  } finally {
    console.log("finally");
  }
}
async function sendSms(phone, code, country_code) {
  let connect;
  try {
    connect = await database.connection.getConnection();
    const [row] = await connect.query(
      "SELECT * FROM config WHERE id = 1 LIMIT 1"
    );
    const optionsRefresh = {
      method: "PATCH",
      uri: "https://notify.eskiz.uz/api/auth/refresh",
      json: true,
      headers: {
        Authorization: "Bearer " + row[0].token_sms,
      },
    };
    await rp(optionsRefresh);
    const optionsUpdate = {
      method: "POST",
      body: {
        email: "tirgolog@gmail.com",
        password: "G0ZwuvgWNTqesEjqrYzG9CuE4Gc3MFKiUhsppiNh",
      },
      json: true,
      uri: "https://notify.eskiz.uz/api/auth/login",
    };
    const rp_res_update = await rp(optionsUpdate);
    if (rp_res_update.data) {
      await connect.query("UPDATE config SET token_sms = ? WHERE id = 1", [
        rp_res_update.data.token,
      ]);
      const options = {
        method: "POST",
        uri: "https://notify.eskiz.uz/api/message/sms/send",
        json: true,
        body: {
          mobile_phone: phone,
          message: "Confirmation code " + code,
        },
        headers: {
          Authorization: "Bearer " + rp_res_update.data.token,
        },
      };
      const rp_res = await rp(options);
      return rp_res.status;
    }
  } catch (err) {
    return false;
  } finally {
    if (connect) {
      connect.release();
    }
  }
}

function generateUniqueId() {
  return crypto.randomBytes(16).toString("hex");
}

function generateHash(txn_id, login, sender, phone_number, hash) {
  const dlm = ";";
  const hashString = `${txn_id}${dlm}${login}${dlm}${sender}${dlm}${phone_number}${dlm}${hash}`;
  return crypto.createHash("sha256").update(hashString).digest("hex");
}

users.get("/getTokenEskiz", async function (req, res) {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    options = {
      method: "POST",
      body: {
        email: "tirgolog@gmail.com",
        password: "G0ZwuvgWNTqesEjqrYzG9CuE4Gc3MFKiUhsppiNh",
      },
      json: true,
      uri: "https://notify.eskiz.uz/api/auth/login",
    };
  try {
    connect = await database.connection.getConnection();
    const rp_res = await rp(options);
    appData.rp_res = rp_res;
    if (rp_res.data) {
      await connect.query("UPDATE config SET token_sms = ? WHERE id = 1", [
        rp_res.data.token,
      ]);
    }
    res.status(200).json(appData);
  } catch (err) {
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

async function getCityFromLatLng(lat, lng) {
  connect = await database.connection.getConnection();
  const [row] = await connect.query(
    "SELECT * FROM config WHERE id = 1 LIMIT 1"
  );
  let options = {
    method: "GET",
    uri:
      "https://geocode-maps.yandex.ru/1.x/?format=json&geocode=" +
      lng +
      "," +
      lat +
      `&apikey=${row[0]?.key_api_maps}&lang=ru-RU`,
  };
  try {
    const res = JSON.parse(await rp(options));
    let country =
      res.response.GeoObjectCollection.featureMember[0].GeoObject
        .metaDataProperty.GeocoderMetaData.AddressDetails.Country.CountryName;
    let city =
      res.response.GeoObjectCollection.featureMember[0].GeoObject
        .metaDataProperty.GeocoderMetaData.AddressDetails.Country
        .AdministrativeArea.AdministrativeAreaName;
    if (country && city) {
      return {
        country,
        city,
      };
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (connect) {
      connect.release();
    }
  }
}
users.post("/findCity", async (req, res) => {
  let query = {
    query: req.body.query,
    count: 10,
    restrict_value: true,
    locations: [{ country: "*" }],
  },
    appData = { status: false },
    options = {
      method: "POST",
      uri: "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address",
      body: query,
      json: true,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
        Authorization: "Token 29e37d461fc7a120bf3095b2e7aee7e38b9c1f0a",
      },
    };
  try {
    appData.data = await rp(options);
    appData.status = true;
    res.status(200).json(appData);
  } catch (e) {
    appData.error = e.message;
    console.error(e);
    res.status(200).json(appData);
  }
});

// (999) 13-37-913
users.post("/login", async (req, res) => {
  let connect,
    appData = { status: false },
    country_code = req.body.country_code,
    isTelegram = req.body.isTelegram,
    send_sms_res = "";
  (code = Math.floor(10000 + Math.random() * 89999)),
    (phone = req.body.phone.replace(/[^0-9, ]/g, "").replace(/ /g, ""));
  try {
    console.log("phone", phone);
    connect = await database.connection.getConnection();
    if (phone === "998935421324" || phone === "9988888888") {
      code = "00000";
    }
    if (!isTelegram) {
      if (phone.substr(0, 3) === "998") {
        send_sms_res = await sendSmsPlayMobile(phone, code, country_code);
        console.log("send_sms_res", send_sms_res);
        //send_sms_res = await sendSms(phone,code,country_code)
      } else if (phone.substr(0, 3) === "992") {
        send_sms_res = await sendSmsOson(phone, code);
        console.log("send_sms_res", send_sms_res);
        //send_sms_res = await sendSms(phone,code,country_code)
      } else if (phone.substr(0, 2) === "79") {
        let options = {
          method: "GET",
          uri:
            "http://api.iqsms.ru/messages/v2/send/?phone=" +
            phone +
            "&text=Confirmation code " +
            code,
          json: false,
          headers: {
            Authorization:
              "Basic " + Buffer.from("fxkKt7iR:fTsODP6m").toString("base64"),
          },
        };
        console.log("code Russian", code);
        await rp(options);
        send_sms_res = "waiting";
      } else {
        sendpulse.init(
          API_USER_ID,
          API_SECRET,
          TOKEN_STORAGE,
          async function (res) {
            sendpulse.smsSend(
              function (data) {
              },
              "TIRGO",
              ["+" + phone],
              "Confirmation code " + code
            );
          }
        );
        send_sms_res = "waiting";
      }
    }

    const [rows] = await connect.query(
      "SELECT * FROM users_contacts WHERE text = ? AND user_type = 1",
      [phone]
    );
    if (rows.length > 0) {

      if (isTelegram) {
        const [chatBotuser] = await connect.query(
          "SELECT chat_id FROM services_bot_users WHERE phone_number = ?",
          [phone]
        );

        if (!chatBotuser.length) {
          appData.status = false;
          appData.message = 'User is not registered in bot';
          res.status(403).json(appData);
          return;
        }
        socket.emit(14, 'login-code', JSON.stringify({ userChatId: chatBotuser[0]?.chat_id, code }));
        send_sms_res = "waiting"
      }

      if (send_sms_res === "waiting") {
        await connect.query(
          "UPDATE users_contacts SET verify_code = ?, is_tg = ? WHERE text = ? AND user_type = 1",
          [code, isTelegram, phone]
        );
        appData.status = true;
      } else {
        appData.error = "Не удалось отправить SMS";
      }
    } else {

      // if (send_sms_res === "waiting") {
      const [notVerified] = await connect.query(
        "SELECT * FROM users_contacts WHERE text = ? AND user_type = 1 AND verify = 0",
        [phone]
      );
      if (notVerified.length > 0) {
        await connect.query(
          "UPDATE users_contacts SET verify_code = ?, is_tg = ? WHERE text = ? AND user_type = 1",
          [code, isTelegram, phone]
        );
        appData.status = true;
      } else {
        const [insert] = await connect.query(
          "INSERT INTO users_list SET verify_code=?,phone=?,user_type = 1",
          [code, phone]
        );
        await connect.query(
          "INSERT INTO users_contacts SET is_tg = ?, verify_code=?,text=?,user_type = 1,user_id = ?",
          [isTelegram, code, phone, insert.insertId]
        );
        appData.status = true;
      }
      // } else {
      //   appData.error = "Не удалось отправить SMS";
      // }

    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    appData.message = err.message;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

users.post("/refreshToken", async (req, res) => {
  let connect,
    appData = { status: false },
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    refreshTokenFromRequest = req.body.refreshToken;
  try {
    if (!refreshTokenFromRequest)
      return res
        .status(401)
        .json({ status: false, error: "Требуется токен обновления." });
    connect = await database.connection.getConnection();
    const [users_list] = await connect.query(
      "SELECT refresh_token FROM users_list WHERE id = ?",
      [userInfo.id]
    );
    if (users_list[0].refresh_token !== refreshTokenFromRequest) {
      return res
        .status(403)
        .json({ status: false, error: "Неверный токен обновления" });
    } else {
      const token = jwt.sign({ id: userInfo.id }, process.env.SECRET_KEY, { expiresIn: '1440m' });
      const refreshToken = jwt.sign({ id: userInfo.id }, process.env.SECRET_KEY);
      const [setToken] = await connect.query(
        "UPDATE users_list SET date_last_login = ?, refresh_token = ? WHERE id = ?",
        [new Date(), refreshToken, userInfo.id]
      );
      if (setToken.affectedRows > 0) {
        appData.status = true;
        appData.token = token;
        appData.refreshToken = refreshToken;
        res.status(200).json(appData);
        // await connect.query(
        //   "INSERT INTO users_activity SET userid = ?, text = ?",
        //   [
        //     userInfo.id,
        //     "Произведен вход " +
        //       req.headers["user-agent"].split("(")[1].replace(")", "") +
        //       ", IP: " +
        //       parseIp(req).replace("::ffff:", ""),
        //   ]
        // );
        // socket.updateActivity("update-activity", "1");
      } else {
        appData.error = "Данные для входа введены неверно";
        appData.status = false;
        res.status(403).json(appData);
      }
    }
  } catch (err) {
    appData.error = err.message;
    appData.status = false;
    res.status(403).json(appData);
  }
  finally {
    if (connect) {
      connect.release();
    }
  }
});

users.post("/sms-verification", async (req, res) => {
  let connect,
    appData = { status: false },
    country_code = req.body.country_code,
    send_sms_res = "",
    code = Math.floor(10000 + Math.random() * 89999),
    phone = req.body.phone.replace(/[^0-9, ]/g, "").replace(/ /g, "");
  try {
    connect = await database.connection.getConnection();
    if (phone === "998935421324" || phone === "9988888888") {
      code = "00000";
    }
    if (phone.substr(0, 3) === "998") {
      send_sms_res = await sendSmsPlayMobile(phone, code, country_code);
      console.log("send_sms_res", send_sms_res);
    } else if (phone.substr(0, 3) === "992") {
      send_sms_res = await sendSmsOson(phone, code);
      console.log("send_sms_res", send_sms_res);
      //send_sms_res = await sendSms(phone,code,country_code)
    } else if (phone.substr(0, 2) === "79") {
      let options = {
        method: "GET",
        uri:
          "http://api.iqsms.ru/messages/v2/send/?phone=" +
          phone +
          "&text=Confirmation code " +
          code,
        json: false,
        headers: {
          Authorization:
            "Basic " + Buffer.from("fxkKt7iR:fTsODP6m").toString("base64"),
        },
      };
      console.log("code Russian", code);
      await rp(options);
      send_sms_res = "waiting";
    } else {
      sendpulse.init(
        API_USER_ID,
        API_SECRET,
        TOKEN_STORAGE,
        async function (res) {
          sendpulse.smsSend(
            function (data) {
            },
            "TIRGO",
            ["+" + phone],
            "Confirmation code " + code
          );
        }
      );
      send_sms_res = "waiting";
    }
    await connect.query(
      "UPDATE users_list SET verification_code = ?  WHERE phone= ? ",
      [code, phone]
    );
    appData.status = true;
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    appData.message = err.message;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

users.post("/loginClient", async (req, res) => {
  let connect,
    appData = { status: false },
    country_code = req.body.country_code,
    isTelegram = req.body.isTelegram,
    send_sms_res = "",
    code = Math.floor(10000 + Math.random() * 89999),
    phone = req.body.phone.replace(/[^0-9, ]/g, "").replace(/ /g, "");
  try {
    connect = await database.connection.getConnection();
    if (phone === "998935421324" || phone === "9988888888") {
      code = "00000";
    }
    if (!isTelegram) {
      if (phone.substr(0, 3) === "998") {
        send_sms_res = await sendSmsPlayMobile(phone, code, country_code);
        //await sendSms(phone,code,country_code)
      } else if (phone.substr(0, 3) === "992") {
        send_sms_res = await sendSmsOson(phone, code);
        console.log("send_sms_res", send_sms_res);
        //send_sms_res = await sendSms(phone,code,country_code)
      } else if (phone.substr(0, 2) === "79") {
        let options = {
          method: "GET",
          uri:
            "http://api.iqsms.ru/messages/v2/send/?phone=" +
            phone +
            "&text=Confirmation code " +
            code,
          json: false,
          headers: {
            Authorization:
              "Basic " + Buffer.from("fxkKt7iR:fTsODP6m").toString("base64"),
          },
        };
        console.log("code Russian", code);
        await rp(options);
        send_sms_res = "waiting";
      } else {
        sendpulse.init(
          API_USER_ID,
          API_SECRET,
          TOKEN_STORAGE,
          async function (res) {
            sendpulse.smsSend(
              function (data) {
                console.log(data, "senpulse");
              },
              "TIRGO",
              ["+" + phone],
              "Confirmation code " + code
            );
          }
        );
        send_sms_res = "waiting";
      }
    }

    const [rows] = await connect.query(
      "SELECT * FROM users_contacts WHERE text = ? AND user_type = 2",
      [phone]
    );
    if (rows.length > 0) {

      if (isTelegram) {
        const [chatBotuser] = await connect.query(
          "SELECT chat_id FROM services_bot_users WHERE phone_number = ?",
          [phone]
        );

        if (!chatBotuser.length) {
          appData.status = false;
          appData.message = 'User is not registered in bot';
          res.status(403).json(appData);
          return;
        }
        socket.emit(14, 'login-code', JSON.stringify({ userChatId: chatBotuser[0]?.chat_id, code }));
        send_sms_res = "waiting"
      }

      if (send_sms_res === "waiting") {
        await connect.query(
          "UPDATE users_contacts SET verify_code = ?, is_tg = ? WHERE text = ? AND user_type = 2",
          [code, isTelegram, phone]
        );
        appData.status = true;
      } else {
        appData.error = "Не удалось отправить SMS";
      }
    } else {
      if (send_sms_res === "waiting") {
        const [insert] = await connect.query(
          "INSERT INTO users_list SET verify_code=?,phone=?,user_type = 2",
          [code, phone]
        );
        await connect.query(
          "INSERT INTO users_contacts SET is_tg = ?, verify_code=?,text=?,user_type = 2,user_id = ?",
          [isTelegram, code, phone, insert.insertId]
        );
        appData.status = true;
      } else {
        appData.error = "Не удалось отправить SMS";
      }
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    appData.message = err.message;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

users.post("/codeverify", async (req, res) => {
  let connect,
    appData = { status: false },
    phone = req.body.phone?.replace(/[^0-9, ]/g, "")?.replace(/ /g, ""),
    code = req.body.code;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_contacts WHERE verify_code = ? AND text = ? AND user_type = 1 LIMIT 1",
      [code, phone]
    );
    if (rows.length > 0) {
      await connect.query(
        "UPDATE users_contacts SET verify = 1 WHERE text = ? AND user_type = 1 AND verify_code = ?",
        [phone, code]
      );
      const token = jwt.sign({ id: rows[0].user_id }, process.env.SECRET_KEY, { expiresIn: '1440m' });
      const refreshToken = jwt.sign({ id: rows[0].user_id }, process.env.SECRET_KEY);
      const [setToken] = await connect.query(
        "UPDATE users_list SET date_last_login = ?, refresh_token = ? WHERE id = ?",
        [new Date(), refreshToken, rows[0].user_id]
      );
      if (setToken.affectedRows > 0) {
        appData.status = true;
        appData.token = token;
        appData.refreshToken = refreshToken;
        res.status(200).json(appData);
        await connect.query(
          "INSERT INTO users_activity SET userid = ?, text = ?",
          [
            rows[0].user_id,
            "Произведен вход " +
            req.headers["user-agent"].split("(")[1]?.replace(")", "") +
            ", IP: " +
            parseIp(req)?.replace("::ffff:", ""),
          ]
        );
        socket.updateActivity("update-activity", "1");
      } else {
        appData.error = "Данные для входа введены неверно";
        appData.status = false;
        res.status(403).json(appData);
      }
    } else {
      appData.error = "Проверочный код введен не верно";
      appData.status = false;
      res.status(403).json(appData);
      return
    }
  } catch (err) {
    console.log(err)
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

users.post("/codeverifycation", async (req, res) => {
  let connect,
    appData = { status: false },
    phone = req.body.phone.replace(/[^0-9, ]/g, "").replace(/ /g, ""),
    code = req.body.code;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_list WHERE verification_code = ? AND phone = ? ",
      [code, phone]
    );
    if (rows.length > 0) {
      const token = jwt.sign({ id: rows[0].user_id }, process.env.SECRET_KEY, { expiresIn: '1440m' });
      const refreshToken = jwt.sign({ id: rows[0].user_id }, process.env.SECRET_KEY);
      const [setToken] = await connect.query(
        "UPDATE users_list SET date_last_login = ?, refresh_token = ? WHERE id = ?",
        [new Date(), refreshToken, rows[0].user_id]
      );
      if (setToken.affectedRows > 0) {
        appData.status = true;
        appData.token = token;
        appData.refreshToken = refreshToken;
        res.status(200).json(appData);
        await connect.query(
          "INSERT INTO users_activity SET userid = ?, text = ?",
          [
            rows[0].user_id,
            "Произведен вход " +
            req.headers["user-agent"].split("(")[1].replace(")", "") +
            ", IP: " +
            parseIp(req).replace("::ffff:", ""),
          ]
        );
        socket.updateActivity("update-activity", "1");
      } else {
        appData.error = "Данные для входа введены неверно";
        appData.status = false;
        res.status(403).json(appData);
      }
    } else {
      appData.error = "Данные для входа введены неверно";
      appData.status = false;
      res.status(403).json(appData);
    }
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

users.post("/codeverifyClient", async (req, res) => {
  let connect,
    appData = { status: false },
    phone = req.body.phone.replace(/[^0-9, ]/g, "").replace(/ /g, ""),
    code = req.body.code;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_contacts WHERE verify_code = ? AND text = ? AND user_type = 2 LIMIT 1",
      [code, phone]
    );
    if (rows.length > 0) {
      await connect.query(
        "UPDATE users_contacts SET verify = 1 WHERE text = ? AND user_type = 2 AND verify_code = ?",
        [phone, code]
      );
      const token = jwt.sign({ id: rows[0].user_id }, process.env.SECRET_KEY, { expiresIn: '1440m' });
      const refreshToken = jwt.sign({ id: rows[0].user_id }, process.env.SECRET_KEY);
      const [setToken] = await connect.query(
        "UPDATE users_list SET date_last_login = ?, refresh_token = ? WHERE id = ?",
        [new Date(), refreshToken, rows[0].user_id]
      );
      if (setToken.affectedRows > 0) {
        appData.status = true;
        appData.token = token;
        appData.refreshToken = refreshToken;
        res.status(200).json(appData);
        await connect.query(
          "INSERT INTO users_activity SET userid = ?, text = ?",
          [
            rows[0].user_id,
            "Произведен вход " +
            req.headers["user-agent"].split("(")[1].replace(")", "") +
            ", IP: " +
            parseIp(req).replace("::ffff:", ""),
          ]
        );
        socket.updateActivity("update-activity", "1");
      } else {
        appData.error = "Данные для входа введены неверно";
        appData.status = false;
        res.status(403).json(appData);
      }
    } else {
      appData.error = "Данные для входа введены неверно";
      appData.status = false;
      res.status(403).json(appData);
    }
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

users.use((req, res, next) => {
  let token =
    req.body.token ||
    req.headers["token"] ||
    (req.headers.authorization && req.headers.authorization.split(" ")[1]);
  let appData = {};
  if (token && token !== undefined && token !== 'undefined') {
    jwt.verify(token, process.env.SECRET_KEY, function (err, decoded) {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          appData["error"] = "Token has expired";
          return res.status(401).json(appData);
        } else {
          console.error("JWT Verification Error:", err);
          appData["error"] = "Token is invalid";
          return res.status(401).json(appData);
        }
      } else {
        // Check if token has expired
        const currentTimestamp = Math.floor(Date.now() / 1000);
        if (decoded.exp < currentTimestamp) {
          appData["data"] = "Token has expired";
          return res.status(401).json(appData);
        }
        // Attach user information from the decoded token to the request
        req.user = decoded;
        next();
      }
    });
  } else {
    appData["error"] = "Token is null";
    res.status(401).json(appData);
  }
});

users.post("/saveDeviceToken", async (req, res) => {
  let connect,
    appData = { status: false },
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    token_device = req.body.token_device;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_list SET token = ? WHERE id = ?",
      [token_device, userInfo.id]
    );
    if (rows.affectedRows > 0) {
      //const subRes = await push.subscribeToTopic(token_device, 'news');
      appData.status = true;
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    appData.message = err.message;
    appData.data = "Неизвестная ошибка";
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
users.post("/addContact", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    country_code = req.body.country_code,
    telegram = req.body.telegram,
    whatsapp = req.body.whatsapp,
    viber = req.body.viber,
    send_sms_res = "",
    phone = req.body.phone.replace(/[^0-9, ]/g, "").replace(/ /g, ""),
    code = Math.floor(10000 + Math.random() * 89999),
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    if (phone === "998935421324") {
      code = "00000";
    }
    const [rows] = await connect.query(
      "SELECT * FROM users_contacts WHERE text = ? AND verify = 1 LIMIT 1",
      [phone]
    );
    if (!rows.length) {
      if (phone.substr(0, 3) === "998") {
        send_sms_res = await sendSmsPlayMobile(phone, code, country_code);
      } else if (phone.substr(0, 3) === "992") {
        send_sms_res = await sendSmsOson(phone, code);
        console.log("send_sms_res", send_sms_res);
        //send_sms_res = await sendSms(phone,code,country_code)
      } else if (phone.substr(0, 2) !== "79" && phone.substr(0, 2) !== "77") {
        let options = {
          method: "GET",
          uri:
            "http://api.iqsms.ru/messages/v2/send/?phone=" +
            phone +
            "&text=Confirmation code " +
            code,
          json: false,
          headers: {
            Authorization:
              "Basic " + Buffer.from("fxkKt7iR:fTsODP6m").toString("base64"),
          },
        };
        console.log("code Russian", code);
        await rp(options);
        send_sms_res = "waiting";
      } else {
        sendpulse.init(
          API_USER_ID,
          API_SECRET,
          TOKEN_STORAGE,
          async function (res) {
            sendpulse.smsSend(
              function (data) {
                console.log(data, "senpulse");
              },
              "TIRGO",
              ["+" + phone],
              "Confirmation code " + code
            );
          }
        );
        send_sms_res = "waiting";
      }
      if (send_sms_res === "waiting") {
        const [insert] = await connect.query(
          "INSERT INTO users_contacts SET type = ?,text = ?,telegram = ?,whatsapp = ?,viber = ?,user_id = ?,verify_code = ?",
          ["phone", phone, telegram, whatsapp, viber, userInfo.id, code]
        );
        appData.id = insert.insertId;
        appData.status = true;
      } else {
        appData.error =
          "Не удалось отправить СМС мы уже решаем данный вопрос. Попробуйте позже.";
      }
    } else {
      if (rows[0].user_id === userInfo.id) {
        appData.error = "У Вас уже добавлен данный контакт";
      } else {
        appData.error = "Данный контакт уже добавлен в другой профиль";
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

users.post("/verifyNewContact", async (req, res) => {
  let connect,
    appData = { status: false },
    phone = req.body.phone.replace(/[^0-9, ]/g, "").replace(/ /g, ""),
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    code = req.body.code;
  try {
    console.log(phone);
    console.log(code);
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_contacts WHERE verify_code = ? AND text = ? AND user_id = ? LIMIT 1",
      [code, phone, userInfo.id]
    );
    if (rows.length > 0) {
      await connect.query(
        "DELETE FROM users_contacts WHERE text = ? AND user_id = ? AND id <> ?",
        [phone, userInfo.id, rows[0].id]
      );
      await connect.query(
        "UPDATE users_contacts SET verify = 1 WHERE text = ? AND user_id = ?",
        [phone, userInfo.id]
      );
      appData.status = true;
    } else {
      appData.text = "Проверочный код введен не верно";
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

users.get("/getMerchantBalance", async function (req, res) {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    appData = { status: false, timestamp: new Date().getTime() };
  const clientId = req.query.clientId;
  try {
    connect = await database.connection.getConnection();
    const [removalBalance] = await connect.query(
      `SELECT * from secure_transaction where userid = ? and status = 2`,
      [clientId]
    );
    const [frozenBalance] = await connect.query(
      `SELECT * from secure_transaction where userid = ? and status <> 2`,
      [clientId]
    );
    const totalRemovalAmount = removalBalance.reduce(
      (accumulator, secure) =>
        accumulator + (Number(secure.amount) + secure.additional_amount),
      0
    );
    const totalFrozenAmount = frozenBalance.reduce(
      (accumulator, secure) =>
        accumulator + (Number(secure.amount) + secure.additional_amount),
      0
    );
    appData.data = { totalFrozenAmount, totalRemovalAmount };
    res.status(200).json(appData);
  } catch (err) {
    appData.message = err.message;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

users.get("/checkSession", async function (req, res) {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_list WHERE id = ? AND user_type = 1 AND ban <> 1 AND deleted <> 1",
      [userInfo.id]
    );

    console.log(userInfo.id, "userId Sesion");
    if (rows.length) {
      const [config] = await connect.query("SELECT * FROM config LIMIT 1");
      const [verification] = await connect.query(
        "SELECT * FROM verification WHERE  user_id = ? LIMIT 1",
        [rows[0].id]
      );
      const [transport] = await connect.query(
        "SELECT * FROM  users_transport WHERE user_id = ? LIMIT 1",
        [rows[0].id]
      );
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
        `SELECT id, amount
         FROM subscription_transaction
         WHERE userid = ? AND deleted = 0 AND COALESCE(agent_id, admin_id) IS NULL
        `,
        [rows[0]?.id]
      );
      const [subscription] = await connect.query(
        `SELECT id, to_subscription, from_subscription
         FROM users_list
         WHERE 
            to_subscription > CURDATE() 
            AND from_subscription IS NOT NULL 
            AND to_subscription IS NOT NULL
            AND id = ? 
           `,
        [userInfo.id]
      );
      // console.log(subscription.length, 'subscription');
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
      // console.log(
      //   "payments",
      //   payments,
      //   totalActiveAmount,
      //   totalPayments,
      //   totalSubscriptionPayment,
      //   totalWithdrawalAmount
      // );
      // console.log(
      //   totalActiveAmount +
      //     (totalPayments - totalSubscriptionPayment) -
      //     totalWithdrawalAmount
      // );

    //   const [result] = await connect.query(`
    // SELECT 
    //     (COALESCE(
    //       (SELECT SUM(amount) FROM driver_group_transaction WHERE driver_group_id = ${rows[0]?.driver_group_id} AND type = 'Пополнение'), 0) -
    //     COALESCE(
    //       (SELECT SUM(amount) FROM driver_group_transaction WHERE driver_group_id = ${rows[0]?.driver_group_id} AND type = 'Вывод'), 0)) -

    //     (COALESCE(
    //       (SELECT SUM(amount) FROM subscription_transaction WHERE deleted = 0 AND group_id = ${rows[0]?.driver_group_id}), 0) +
    //     COALESCE(
    //       (SELECT SUM(amount) FROM services_transaction WHERE group_id = ${rows[0]?.driver_group_id} AND status In(2, 3)), 0)) as balance;
    // `);

    const [driverGroupBalance] = await connect.query(
      `SELECT 
      COALESCE((SELECT SUM(amount_tir) FROM tir_balance_exchanges WHERE group_id = ${rows[0]?.driver_group_id} AND user_id = ${rows[0]?.driver_group_id} AND balance_type = 'tirgo' ), 0) -
      COALESCE((SELECT SUM(amount_tir) FROM tir_balance_transaction WHERE deleted = 0 AND group_id = ${rows[0]?.driver_group_id} AND transaction_type = 'subscription' ), 0)  AS tirgoBalance,

      COALESCE((SELECT SUM(amount_tir) FROM tir_balance_exchanges WHERE group_id = ${rows[0]?.driver_group_id} AND user_id = ${rows[0]?.driver_group_id} AND balance_type = 'tirgo_service' ), 0) -
      COALESCE((SELECT SUM(amount_tir) FROM tir_balance_transaction WHERE deleted = 0 AND group_id = ${rows[0]?.driver_group_id} AND transaction_type = 'service' AND status In(2, 3)), 0) AS serviceBalance
    `);

      appData.user = rows[0];
      appData.user.transport = transport[0];
      appData.user.driver_verification = verification[0]?.verified;
      // console.log(appData.user.driver_verification, "driver_verification");
      appData.user.send_verification = verification[0]?.send_verification;
      appData.user.groupBalance = driverGroupBalance[0]?.serviceBalance;
      appData.user.balance =
        totalActiveAmount +
        (totalPayments - totalSubscriptionPayment) -
        totalWithdrawalAmount;
      appData.user.balance_in_proccess = totalWithdrawalAmountProcess;
      appData.user.balance_off = totalFrozenAmount ? totalFrozenAmount : 0;
      appData.user.issubscription = subscription.length > 0 ? true : false;
      appData.user.subscription = subscription.length > 0 ? subscription : [];
      appData.user.config = config[0];
      // console.log(appData.user, "users");
      appData.user.avatar = fs.existsSync(
        process.env.FILES_PATCH +
        "tirgo/drivers/" +
        userInfo.id +
        "/" +
        rows[0].avatar
      )
        ? process.env.SERVER_URL +
        "tirgo/drivers/" +
        userInfo.id +
        "/" +
        rows[0].avatar
        : null;
      const [files] = await connect.query(
        "SELECT *,name as filename FROM users_list_files WHERE user_id = ? AND active = 1",
        [userInfo.id]
      );
      appData.user.files = await Promise.all(
        files.map(async (item) => {
          let newItem = item;
          newItem.preview = fs.existsSync(
            process.env.FILES_PATCH +
            "tirgo/drivers/" +
            userInfo.id +
            "/" +
            item.filename
          )
            ? process.env.SERVER_URL +
            "tirgo/drivers/" +
            userInfo.id +
            "/" +
            item.filename
            : null;
          return newItem;
        })
      );
      appData.status = true;
      res.status(200).json(appData);
      // await connect.query(
      //   "INSERT INTO users_activity SET userid = ?,text = ?",
      //   [
      //     userInfo.id,
      //     "Произведен вход " +
      //     req.headers["user-agent"].split("(")[1].replace(")", "") +
      //     ",IP: " +
      //     parseIp(req).replace("::ffff:", ""),
      //   ]
      // );
      // socket.updateActivity("update-activity", "1");
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
users.get("/checkSessionClient", async function (req, res) {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    appData = { status: false, timestamp: new Date().getTime() };
  console.log(userInfo.id)
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_list WHERE id = ? AND user_type = 2  AND deleted <> 1",
      [userInfo.id]
    );
    if (rows.length) {
      const [config] = await connect.query("SELECT * FROM config LIMIT 1");
      appData.user = rows[0];
      appData.user.config = config;
      appData.user.avatar = fs.existsSync(
        process.env.FILES_PATCH +
        "tirgo/clients/" +
        userInfo.id +
        "/" +
        rows[0].avatar
      )
        ? process.env.SERVER_URL +
        "tirgo/clients/" +
        userInfo.id +
        "/" +
        rows[0].avatar
        : null;
      const [files] = await connect.query(
        "SELECT * FROM users_list_files WHERE user_id = ?",
        [userInfo.id]
      );
      appData.user.files = await Promise.all(
        files.map(async (item) => {
          let newItem = item;
          newItem.image = fs.existsSync(
            process.env.FILES_PATCH +
            "tirgo/drivers/" +
            userInfo.id +
            "/" +
            item.name
          )
            ? process.env.SERVER_URL +
            "tirgo/drivers/" +
            userInfo.id +
            "/" +
            item.name
            : null;
          return newItem;
        })
      );
      appData.status = true;
      res.status(200).json(appData);
      // await connect.query(
      //   "INSERT INTO users_activity SET userid = ?,text = ?",
      //   [
      //     userInfo.id,
      //     "Произведен вход " +
      //     req.headers["user-agent"].split("(")[1].replace(")", "") +
      //     ",IP: " +
      //     parseIp(req).replace("::ffff:", ""),
      //   ]
      // );
      // socket.updateActivity("update-activity", "1");
    } else {
      res.status(200).json(appData);
    }
  } catch (err) {
    appData.status = false;
    appData.error = err;
    appData.message = err.message;
    appData.data = "Неизвестная ошибка2";
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

users.post("/regUser", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    name = req.body.name,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [update] = await connect.query(
      "UPDATE users_list SET name = ? WHERE id = ?",
      [name, userInfo.id]
    );
    if (update.affectedRows) {
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
users.post("/setRaitingUser", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    orderid = req.body.orderid,
    star = req.body.star,
    userid = req.body.userid,
    newreiting = 0,
    comment = req.body.comment;
  try {
    connect = await database.connection.getConnection();
    const [update] = await connect.query(
      "UPDATE orders SET raiting_user = ?,comment = ? WHERE id = ?",
      [star, comment, orderid]
    );
    if (update.affectedRows) {
      appData.status = true;
      const [getuserid] = await connect.query(
        "SELECT * FROM orders WHERE user_id = ?",
        [userid]
      );
      if (getuserid.length) {
        for (let row of getuserid) {
          newreiting = +newreiting + +row.raiting_user;
        }
        await connect.query("UPDATE users_list SET raiting = ? WHERE id = ?", [
          +newreiting / getuserid.length,
          userid,
        ]);
      }
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
users.post("/setRaitingDriver", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    orderid = req.body.orderid,
    star = req.body.star,
    driverid = req.body.driverid,
    newreiting = 0,
    comment = req.body.comment;
  try {
    connect = await database.connection.getConnection();
    const [update] = await connect.query(
      "UPDATE orders SET raiting_driver = ?,comment_client = ? WHERE id = ?",
      [star, comment, orderid]
    );
    if (update.affectedRows) {
      appData.status = true;
      const [getuserid] = await connect.query(
        "SELECT * FROM orders WHERE driver_id = ?",
        [driverid]
      );
      if (getuserid.length) {
        for (let row of getuserid) {
          newreiting = +newreiting + +row.raiting_driver;
        }
        await connect.query("UPDATE users_list SET raiting = ? WHERE id = ?", [
          +newreiting / getuserid.length,
          driverid,
        ]);
      }
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
users.post("/regUserClient", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    name = req.body.name,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [update] = await connect.query(
      "UPDATE users_list SET name = ? WHERE id = ?",
      [name, userInfo.id]
    );
    if (update.affectedRows) {
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
users.post("/saveCityInfo", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    city = req.body.city,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    console.log(city.country);
    const [rows] = await connect.query(
      "UPDATE users_list SET country = ?,city = ?,geo_id = ?,iso_code = ?,city_lat = ?,city_lng = ? WHERE id = ?",
      [
        city.country,
        city.city ? city.city : city.region,
        city.geoname_id,
        city.country_iso_code,
        city.geo_lat,
        city.geo_lon,
        userInfo.id,
      ]
    );
    if (rows.affectedRows) {
      console.log(userInfo.id);
      appData.status = true;
      res.status(200).json(appData);
    } else {
      appData.error = "Что то пошло не так";
      res.status(200).json(appData);
    }
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
users.post("/saveCityInfoClient", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    city = req.body.city,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    console.log(city.country);
    const [rows] = await connect.query(
      "UPDATE users_list SET country = ?,city = ?,geo_id = ?,iso_code = ?,city_lat = ?,city_lng = ? WHERE id = ?",
      [
        city.country,
        city.city ? city.city : city.region,
        city.geoname_id,
        city.country_iso_code,
        city.geo_lat,
        city.geo_lon,
        userInfo.id,
      ]
    );
    if (rows.affectedRows) {
      console.log(userInfo.id);
      appData.status = true;
      res.status(200).json(appData);
    } else {
      appData.error = "Что то пошло не так";
      res.status(200).json(appData);
    }
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
users.post("/updateLocationDriver", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    lat = req.body.lat,
    lng = req.body.lng,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [update] = await connect.query(
      "UPDATE users_list SET lat = ?,lng = ? WHERE id = ?",
      [lat, lng, userInfo.id]
    );
    if (update.affectedRows) {
      appData.status = true;
      await connect.query(
        "INSERT INTO locations SET lat = ?,lng = ?, user_id = ?",
        [lat, lng, userInfo.id]
      );
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
users.post("/updateLocationClient", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    lat = req.body.lat,
    lng = req.body.lng,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [update] = await connect.query(
      "UPDATE users_list SET lat = ?,lng = ? WHERE id = ?",
      [lat, lng, userInfo.id]
    );
    if (update.affectedRows) {
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
users.post("/editPassword", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    password = req.body.currPass,
    newpassword = req.body.newPass,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    password = crypto.createHash("sha1").update(password).digest("hex");
    newpassword = crypto.createHash("sha1").update(newpassword).digest("hex");
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users WHERE password = ? AND id = ?",
      [password, userInfo.id]
    );
    if (rows.length) {
      const [update] = await connect.query(
        "UPDATE users SET password = ? WHERE id = ?",
        [newpassword, userInfo.id]
      );
      if (update.affectedRows) {
        appData.status = true;
      } else {
        appData.error = "Что то пошло не так";
      }
    } else {
      appData.error = "Старый пароль не подходит";
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
users.post("/getPartnersAdmin", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT u.name as directorname,c.* FROM companies c LEFT JOIN users_list u ON u.id = c.user_id ORDER by c.id DESC"
    );
    if (rows.length) {
      appData.data = await Promise.all(
        rows.map(async (item) => {
          let i = 0;
          let newItem = item;
          const [users] = await connect.query(
            "SELECT * FROM user_profiles WHERE company_id = ?",
            [item.id]
          );
          newItem.users = await Promise.all(
            users.map(async (item2) => {
              let newItemUsers = item2;
              const [cars] = await connect.query(
                "SELECT * FROM cars WHERE user_id = ?",
                [item2.user_id]
              );
              i = i + cars.length;
              newItemUsers.cars = await Promise.all(
                cars.map(async (item3) => {
                  return item3;
                })
              );
              return newItemUsers;
            })
          );
          newItem.cars_quantity = i;
          return newItem;
        })
      );
      appData.status = true;
    } else {
      appData.error = "Нет партнеров";
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
users.post("/getAllReviews", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT tb.* FROM truck_bookings tb LEFT JOIN booking_offers bo ON tb.id = bo.truck_booking_id"
    );
    if (rows.length) {
      appData.data = rows;
    } else {
      appData.error = "Нет партнеров";
    }
    res.status(200).json(appData);
  } catch (err) {
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  }
  finally {
    if (connect) {
      connect.release();
    }
  }
});
users.post("/getOrdersAdmin", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM truck_bookings ORDER BY id DESC"
    );
    if (rows.length) {
      appData.data = await Promise.all(
        rows.map(async (item) => {
          let newItem = item;
          const [from] = await connect.query(
            "SELECT * FROM city_translations WHERE city_id = ? LIMIT 1",
            [item.region_from_id]
          );
          const [to] = await connect.query(
            "SELECT * FROM city_translations WHERE city_id = ? LIMIT 1",
            [item.region_to_id]
          );
          newItem.region_to = from[0].title;
          newItem.region_from = to[0].title;
          const [offers] = await connect.query(
            "SELECT * FROM booking_offers WHERE truck_booking_id = ?",
            [item.id]
          );
          const [user] = await connect.query(
            "SELECT * FROM user_profiles WHERE user_id = ?",
            [item.user_id]
          );
          newItem.user = user;
          newItem.offers = offers;
          return newItem;
        })
      );
      appData.status = true;
      appData.data = rows;
    } else {
      appData.error = "Нет партнеров";
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
users.post("/getAllClients", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users WHERE role = ? AND id = ?",
      ["client", userInfo.id]
    );
    if (rows.length) {
      appData.data = rows;
    } else {
      appData.error = "Нет партнеров";
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
users.post("/addTransport", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    name = req.body.name,
    description = req.body.description,
    maxweight = req.body.maxweight,
    type = req.body.type,
    car_photos = req.body.car_photos,
    license_files = req.body.license_files,
    tech_passport_files = req.body.tech_passport_files,
    cubature = req.body.cubature,
    state_number = req.body.state_number,
    adr = req.body.adr,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "INSERT INTO users_transport SET name = ?,description = ?,type = ?,max_weight = ?,user_id = ?,adr = ?,cubature = ?,state_number = ?",
      [
        name,
        description,
        type,
        maxweight,
        userInfo.id,
        adr,
        cubature,
        state_number,
      ]
    );
    if (rows.affectedRows) {
      appData.status = true;
      for (let car of car_photos) {
        await connect.query(
          "INSERT INTO users_transport_files SET transport_id = ?,file_patch = ?,name = ?,type_file = ?",
          [rows.insertId, car.preview, car.filename, "car_photos"]
        );
      }
      for (let lic of license_files) {
        await connect.query(
          "INSERT INTO users_transport_files SET transport_id = ?,file_patch = ?,name = ?,type_file = ?",
          [rows.insertId, lic.preview, lic.filename, "license_files"]
        );
      }
      for (let tech of tech_passport_files) {
        await connect.query(
          "INSERT INTO users_transport_files SET transport_id = ?,file_patch = ?,name = ?,type_file = ?",
          [rows.insertId, tech.preview, tech.filename, "tech_passport_files"]
        );
      }
      await connect.query(
        "INSERT INTO users_activity SET userid = ?,text = ?",
        [userInfo.id, "Добавил транспорт " + name]
      );
      socket.updateActivity("update-activity", "1");
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
users.post("/editTransport", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    id = req.body.id,
    name = req.body.name,
    description = req.body.description,
    maxweight = req.body.maxweight,
    type = req.body.type,
    car_photos = req.body.car_photos,
    license_files = req.body.license_files,
    tech_passport_files = req.body.tech_passport_files,
    cubature = req.body.cubature,
    state_number = req.body.state_number,
    adr = req.body.adr,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_transport SET name = ?,description = ?,type = ?,max_weight = ?,user_id = ?,adr = ?,cubature = ? ,state_number = ? WHERE id = ?",
      [
        name,
        description,
        type,
        maxweight,
        userInfo.id,
        adr,
        cubature,
        state_number,
        id,
      ]
    );
    if (rows.affectedRows) {
      await connect.query(
        "DELETE FROM users_transport_files WHERE transport_id = ?",
        [id]
      );
      appData.status = true;
      for (let car of car_photos) {
        await connect.query(
          "INSERT INTO users_transport_files SET transport_id = ?,file_patch = ?,name = ?,type_file = ?",
          [id, car.preview, car.filename, "car_photos"]
        );
      }
      for (let lic of license_files) {
        await connect.query(
          "INSERT INTO users_transport_files SET transport_id = ?,file_patch = ?,name = ?,type_file = ?",
          [id, lic.preview, lic.filename, "license_files"]
        );
      }
      for (let tech of tech_passport_files) {
        await connect.query(
          "INSERT INTO users_transport_files SET transport_id = ?,file_patch = ?,name = ?,type_file = ?",
          [id, tech.preview, tech.filename, "tech_passport_files"]
        );
      }
    } else {
      appData.error =
        "Не получилось отредактировать транспорт. Попробуйте позже.";
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

users.post("/finish-merchant-cargo", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };

  try {
    const { orderId } = req.body;

    if (!orderId) {
      appData.error = "orderId is required";
      res.status(400).json(appData);
    }

    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      `
      UPDATE orders_accepted
      SET status_order = 3
      WHERE order_id = ? AND ismerchant = true`,
      [orderId]
    );
    if (rows.affectedRows) {
      appData.status = true;

      const [orders_accepted] = await connect.query(
        `
        SELECT user_id FROM orders_accepted
        WHERE order_id = ? AND ismerchant = true`,
        [orderId]
      );

      connect.query(
        "UPDATE secure_transaction SET status = 2 WHERE orderid = ?",
        [orderId]
      );
      const [withdrawalsProccess] = await connect.query(
        `SELECT * from driver_withdrawal where driver_id = ? and status = 0`,
        [orders_accepted[0]?.user_id]
      );
      const [withdrawals] = await connect.query(
        `SELECT * from driver_withdrawal where driver_id = ?`,
        [orders_accepted[0]?.user_id]
      );
      const [frozenBalance] = await connect.query(
        `SELECT * from secure_transaction where dirverid = ? and status <> 2`,
        [orders_accepted[0]?.user_id]
      );
      const [activeBalance] = await connect.query(
        `SELECT * from secure_transaction where dirverid = ? and status = 2`,
        [orders_accepted[0]?.user_id]
      );
      const [subscriptionPayment] = await connect.query(
        `SELECT id, amount
    FROM subscription_transaction
    WHERE userid = ? AND deleted = 0
   AND COALESCE(agent_id, admin_id) IS NULL`,
        [orders_accepted[0]?.user_id]
      );
      const [payments] = await connect.query(
        "SELECT amount FROM payment WHERE userid = ? and status = 1 and date_cancel_time IS NULL",
        [orders_accepted[0].user_id]
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

      const user = {};
      user.balance =
        totalActiveAmount +
        (totalPayments - totalSubscriptionPayment) -
        totalWithdrawalAmount;
      user.balance_in_proccess = totalWithdrawalAmountProcess;
      user.balance_off = totalFrozenAmount ? totalFrozenAmount : 0;
      socket.emit(
        orders_accepted[0]?.user_id,
        "update-driver-balance",
        JSON.stringify(user)
      );
    }
    res.status(200).json(appData);
    //    }
  } catch (err) {
    console.log(err);
    appData.error = "Internal error";
    res.status(403).json(appData);
  }
  finally {
    if (connect) {
      connect.release();
    }
  }
});

users.post("/verification", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    const {
      user_id,
      full_name,
      phone,
      selfies_with_passport,
      bank_card,
      bank_cardname,
      transport_front_photo,
      transport_back_photo,
      transport_side_photo,
      adr_photo,
      transport_registration_country,
      driver_license,
      transportation_license_photo,
      techpassport_photo1,
      techpassport_photo2,
      state_registration_truckNumber,
      type,
      brand_name,
    } = req.body;

    if (
      !full_name ||
      !phone ||
      !selfies_with_passport ||
      !bank_card ||
      !bank_cardname ||
      !transport_front_photo ||
      !transport_back_photo ||
      !transport_side_photo ||
      !adr_photo ||
      !transport_registration_country ||
      !driver_license ||
      !transportation_license_photo ||
      !techpassport_photo1 ||
      !techpassport_photo2 ||
      !state_registration_truckNumber ||
      !type ||
      !brand_name
    ) {
      appData.error = "All fields are required";
      res.status(400).json(appData);
    }

    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      `
          INSERT INTO verification set
              user_id = ?,
              full_name = ?,
              phone = ?,
              selfies_with_passport = ?,
              bank_card = ?,
              bank_cardname = ?,
              transport_front_photo = ?,
              transport_back_photo = ?,
              transport_side_photo = ?,
              adr_photo = ?,
              transport_registration_country = ?,
              driver_license = ?,
              transportation_license_photo = ?,
              techpassport_photo1 = ?,
              techpassport_photo2 = ?,
              state_registration_truckNumber = ?,
              type = ?,
              brand_name = ?,
              send_verification = ?
              `,
      [
        userInfo.id,
        full_name,
        phone,
        selfies_with_passport,
        bank_card,
        bank_cardname,
        transport_front_photo,
        transport_back_photo,
        transport_side_photo,
        adr_photo,
        transport_registration_country,
        driver_license,
        transportation_license_photo,
        techpassport_photo1,
        techpassport_photo2,
        state_registration_truckNumber,
        type,
        brand_name,
        1,
      ]
    );
    if (rows.affectedRows) {
      appData.status = true;
    }
    res.status(200).json(appData);
  } catch (err) {
    console.log(err);
    appData.error = "Internal error";
    res.status(403).json(appData);
  }
  finally {
    if (connect) {
      connect.release();
    }
  }
});

users.put("/update-verification", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const {
      id,
      user_id,
      full_name,
      phone,
      selfies_with_passport,
      bank_card,
      bank_cardname,
      transport_front_photo,
      transport_back_photo,
      transport_side_photo,
      adr_photo,
      transport_registration_country,
      driver_license,
      transportation_license_photo,
      techpassport_photo1,
      techpassport_photo2,
      state_registration_truckNumber,
      type,
      brand_name,
    } = req.body;
    if (
      !id ||
      !user_id ||
      !full_name ||
      !phone ||
      !selfies_with_passport ||
      !bank_card ||
      !bank_cardname ||
      !transport_front_photo ||
      !transport_back_photo ||
      !transport_side_photo ||
      !adr_photo ||
      !transport_registration_country ||
      !driver_license ||
      !transportation_license_photo ||
      !techpassport_photo1 ||
      !techpassport_photo2 ||
      !state_registration_truckNumber ||
      !type ||
      !brand_name
    ) {
      appData.error = "All fields are required";
      res.status(400).json(appData);
    }
    // connect = await database.connection.getConnection();
    // const [rows] = await connect.query(
    //   `UPDATE verification
    //     SET
    //         user_id = ?,
    //         full_name = ?,
    //         phone = ?,
    //         selfies_with_passport = ?,
    //         bank_card = ?,
    //         bank_cardname = ?,
    //         transport_front_photo = ?,
    //         transport_back_photo = ?,
    //         transport_side_photo = ?,
    //         adr_photo = ?,
    //         transport_registration_country = ?,
    //         driver_license = ?,
    //         transportation_license_photo = ?,
    //         techpassport_photo1 = ?,
    //         techpassport_photo2 = ?,
    //         state_registration_truckNumber = ?,
    //         type = ?,
    //         brand_name = ?,
    //         verified = ?
    //     WHERE id = ?`,
    //   [
    //     user_id,
    //     full_name,
    //     phone,
    //     selfies_with_passport,
    //     bank_card,
    //     bank_cardname,
    //     transport_front_photo,
    //     transport_back_photo,
    //     transport_side_photo,
    //     adr_photo,
    //     transport_registration_country,
    //     driver_license,
    //     transportation_license_photo,
    //     techpassport_photo1,
    //     techpassport_photo2,
    //     state_registration_truckNumber,
    //     type,
    //     brand_name,
    //     1,
    //     id,
    //   ]
    // );
    // console.log(rows);
    // if (rows.affectedRows > 0) {
    //   appData.status = true;
    //   console.log(appData);
    //   return res.status(200).json(appData);
    // } else {
    //   appData.error = "No records were updated";
    //   return res.status(404).json(appData);
    // }
  } catch (err) {
    res.status(403).json(appData);
  }
});

users.patch("/verify-driver", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const { id } = req.body;
    if (!id) {
      appData.error = "VerificationId is required";
      res.status(400).json(appData);
    }
    const [rows] = await connect.query(
      "UPDATE verification SET verified = 1 WHERE id = ?",
      [id]
    );
    console.log(rows);
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

users.patch("/unverify-driver", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const { id } = req.body;
    if (!id) {
      appData.error = "VerificationId is required";
      res.status(400).json(appData);
    }
    const [rows] = await connect.query(
      "UPDATE verification SET send_verification = 0, verified = 0 WHERE id = ?",
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

users.delete("/delete-verification", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const { id } = req.query;
    if (!id) {
      appData.error("VerificationId is required");
      res.status(400).json(appData);
    }
    const [rows] = await connect.query(
      "DELETE FROM verification WHERE id = ?",
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

users.get("/verified-verifications", async (req, res) => {
  appData = { status: false, timestamp: new Date().getTime() };
  try {
    const [rows] = await database.connection.query(
      "SELECT * from verification where verified = 1"
    );
    if (rows.length) {
      appData.status = true;
      appData.data = rows;
      res.status(200).json(appData);
    } else {
      appData.status = true;
      appData.data = [];
      res.status(204).json(appData);
    }
  } catch (err) {
    console.log(err);
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  }
});

users.get("/verified-driver", async (req, res) => {
  console.log("verified-driver");
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [rows] = await pool.query(
      `select * from verification  WHERE verified = 1 and  user_id = ?`,
      [userInfo.id]
    );
    if (rows.length) {
      appData.status = true;
      appData.data = rows;
      res.status(200).json(appData);
    } else {
      appData.status = true;
      appData.data = [];
      res.status(204).json(appData);
    }
  } catch (err) {
    console.log(err);
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  }
});

users.get("/unverified-verifications", async (req, res) => {
  let appData = { status: false, timestamp: new Date().getTime() };
  try {
    const [rows] = await database.connection.query(
      "SELECT * from verification where verified = 0"
    );
    if (rows.length) {
      appData.status = true;
      appData.data = rows;
      res.status(200).json(appData);
    } else {
      appData.status = true;
      appData.data = [];
      res.status(204).json(appData);
    }
  } catch (err) {
    console.log(err);
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  }
});

users.post("/setAdrUser", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    enable = req.body.enable,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_list SET adr = ? WHERE id = ?",
      [enable, userInfo.id]
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
users.post("/setDateBirthday", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    date = req.body.date,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_list SET birthday = ? WHERE id = ?",
      [date, userInfo.id]
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

users.post("/delContact", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    id = req.body.id,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "DELETE FROM users_contacts WHERE id = ? AND user_id = ?",
      [id, userInfo.id]
    );
    if (rows.affectedRows) {
      appData.status = true;
    } else {
      appData.error = "Невозможно удалить контакт";
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
users.post("/delTransport", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    id = req.body.id,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_transport SET active = 0 WHERE id = ? AND user_id = ?",
      [id, userInfo.id]
    );
    if (rows.affectedRows) {
      appData.status = true;
    } else {
      appData.error = "Невозможно удалить контакт";
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
users.post("/acceptOrderDriver", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    orderid = req.body.orderid,
    price = req.body.price,
    dates = req.body.dates,
    isMerchant = req.body.isMerchant,
    one_day = 0,
    two_day = 0,
    three_day = 0,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  pricePlus = 0;
  if (isMerchant) {
    const merchantCargos = await axios.get(
      "https://merchant.tirgo.io/api/v1/cargo/id?id=" + orderid
    );
    if (merchantCargos.data.success && merchantCargos.data?.data?.isSafe) {
      let x = +price;
      let y = x / 0.88;
      let t = (12 / 100) * y;
      pricePlus = t + 100;
    }
  }
  try {
    const amqp = require("amqplib");
    const connection = await amqp.connect("amqp://13.232.83.179:5672");
    const channel = await connection.createChannel();
    await channel.assertQueue("acceptOrderDriver");
    if (dates.includes(0)) one_day = 1;
    if (dates.includes(1)) two_day = 1;
    if (dates.includes(2)) three_day = 1;
    connect = await database.connection.getConnection();
    const [orders_accepted] = await connect.query(
      "select * from orders_accepted  where user_id = ? AND order_id = ?",
      [userInfo.id, orderid]
    );
    if (!orders_accepted.length) {
      const [rows] = await connect.query(
        "INSERT INTO orders_accepted SET user_id = ?,order_id = ?,price = ?, additional_price = ?,one_day = ?,two_day = ?,three_day = ?, ismerchant = ?",
        [
          userInfo.id,
          orderid,
          price,
          pricePlus,
          one_day,
          two_day,
          three_day,
          isMerchant,
        ]
      );
      const [order] = await connect.query(
        "select * from orders  where id = ?",
        [orderid]
      );
      const [user] = await connect.query(
        "select * from users_list  where  id= ?",
        [order[0].user_id]
      );
      const [driver] = await connect.query(
        "select * from users_list  where  id= ?",
        [userInfo.id]
      );
      if (user.length) {
        if (user[0].token !== "" && user[0].token !== null) {
          push.send(
            user[0].token,
            "Информация о водителе",
            "Информация об имени водителя " +
            driver[0].name +
            "Телифон " +
            driver[0].phone +
            "Рейтинг " +
            driver[0].phone +
            "Цена " +
            price,
            "",
            ""
          );
        }
      }
      if (rows.affectedRows) {
        console.log("keldi");
        socket.updateAllList("update-all-list", "1");
        channel.sendToQueue("acceptOrderDriver", Buffer.from("request"));
        appData.status = true;
      } else {
        appData.error = "Невозможно принять заказ";
      }
      res.status(200).json(appData);
    } else {
      appData.status = false;
      appData.error = "Вы уже отправили предложение !";
      res.status(400).json(appData);
    }
  } catch (err) {
    appData.status = false;
    appData.error = err;
    console.log(err);
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

users.get("/getAcceptedOrdersDriver", async (req, res) => {
  let connect,
    appData = { status: true, timestamp: new Date().getTime() };
  merchantData = [];
  try {
    connect = await database.connection.getConnection();
    // appData.data = await connect.query('select * from orders_accepted where ismerchant = true left join')
    appData.data = await connect.query(
      "SELECT ul.name, ul.phone, ul.city, ul.country, ul.id as user_id, oa.order_id as orderid, oa.price as priceorder, oa.additional_price, oa.status_order FROM orders_accepted oa LEFT JOIN users_list ul ON ul.id = oa.user_id where ismerchant = true"
    );
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

users.post("/acceptDriverOffer", async (req, res) => {
  let connect,
    orderid = req.body.orderId,
    clientId = req.body.clientId,
    driverId = req.body.driverId,
    amount = req.body.amount,
    addAmount = req.body.additionalAmount,
    appData = { status: false, timestamp: new Date().getTime() },
    isSafe = req.body.isSafe;
  console.log(
    `HTTP acceptDriverOffer: driverId ${driverId} orderId ${orderid}`
  );

  try {
    connect = await database.connection.getConnection();

    const [driver] = await connect.query(
      `SELECT token FROM users_list WHERE id = ${driverId}`
    );

    await connect.query(
      "DELETE FROM orders_accepted WHERE user_id = ? AND order_id <> ?",
      [driverId, orderid]
    );
    await connect.query(
      "DELETE FROM orders_accepted WHERE user_id <> ? AND order_id = ?",
      [driverId, orderid]
    );
    const [rows] = await connect.query(
      "UPDATE orders_accepted SET status_order = 1 WHERE order_id = ? AND user_id = ?",
      [orderid, driverId]
    );
    if (rows.affectedRows) {
      if (isSafe) {
        connect.query(
          `INSERT INTO secure_transaction set userid = ?, dirverid = ?, orderid = ?, amount = ?, additional_amount = ?`,
          [clientId, driverId, orderid, amount, addAmount]
        );
      }
      socket.updateAllList("update-all-list", "1");
      Push.sendToCarrierDevice(driver[0]?.token, 'Одобрение предложения', `Ваше предложение было одобрено на заказ ID: ${orderid}`)
      appData.status = true;
      res.status(200).json(appData);
    } else {
      res.status(200).json(appData);
    }
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

users.post("/cancelOrderDriver", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    order = req.body.item,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "DELETE FROM orders_accepted WHERE order_id = ? AND user_id = ?",
      [order.id, userInfo.id]
    );
    const [orderAll] = await connect.query(
      "select * from orders  where id = ?",
      [order.id]
    );
    const [user] = await connect.query(
      "select *  from users_list  where  id= ?",
      [orderAll[0].user_id]
    );
    const [driver] = await connect.query(
      "select *  from users_list  where  id= ?",
      [userInfo.id]
    );
    if (user.length) {
      if (user[0].token !== "" && user[0].token !== null) {
        push.send(
          user[0].token,
          "Информация о водителе",
          "Информация об имени водителя " +
          driver[0].name +
          "Телифон " +
          driver[0].phone +
          "Рейтинг " +
          driver[0].phone,
          "",
          ""
        );
      }
    }
    if (rows.affectedRows) {
      socket.updateAllList("update-all-list", "1");
      appData.status = true;
    } else {
      appData.error = "Невозможно удалить контакт";
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
users.post("/setBusy", async (req, res) => {
  let connect,
    busy = req.body.busy,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_list SET busy = ? WHERE id = ?",
      [busy, userInfo.id]
    );
    if (rows.affectedRows) {
      appData.status = true;
    } else {
      appData.error = "Невозможно обновить статус";
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
users.post("/acceptDriverClient", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    orderid = req.body.orderid,
    price_off = req.body.price_off ? req.body.price_off : 0,
    id = req.body.id,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    await connect.query(
      "DELETE FROM orders_accepted WHERE user_id = ? AND order_id <> ?",
      [id, orderid]
    );
    const [rows] = await connect.query(
      "UPDATE orders_accepted SET status_order = 1 WHERE order_id = ? AND user_id = ?",
      [orderid, id]
    );

    const [user] = await connect.query(
      "select *  from users_list  where  id= ?",
      [userInfo?.id]
    );
    if (user.length) {
      if (user[0].token !== "" && user[0].token !== null) {
        push.send(
          user[0].token,
          "Информация о клиенте",
          "Имя информационного клиента " +
          user[0].name +
          "Телифон " +
          user[0].phone +
          "Рейтинг " +
          user[0].phone,
          "",
          ""
        );
      }
    }
    if (rows.affectedRows) {
      appData.status = true;
      // const [check_secure] = await connect.query(
      //   "SELECT * FROM secure_transaction WHERE orderid = ? LIMIT 1",
      //   [orderid]
      // );
      // if (check_secure.length) {
      //   await connect.query(
      //     "UPDATE secure_transaction SET dirverid = ? WHERE orderid = ?",
      //     [id, check_secure[0].orderid]
      //   );
      //   await connect.query(
      //     "UPDATE users_list SET balance = balance - ? WHERE id = ?",
      //     [price_off, userInfo.id]
      //   );
      //   await connect.query(
      //     "UPDATE users_list SET balance_off = balance + ? WHERE id = ?",
      //     [price_off, id]
      //   );
      // }
      await connect.query(
        "UPDATE orders SET status = 1,driver_id = ? WHERE id = ? AND user_id = ?",
        [id, orderid, userInfo.id]
      );
      socket.updateAllList("update-all-list", "1");
    } else {
      appData.error = "Невозможно принять водителя";
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
users.post("/cancelDriverClient", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    orderid = req.body.orderid,
    id = req.body.id;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE orders_accepted SET status_order = 2 WHERE order_id = ? AND user_id = ?",
      [orderid, id]
    );
    const [orderAll] = await connect.query(
      "select * from orders_accepted  where id = ?",
      [orderid]
    );
    const [user] = await connect.query(
      "select *  from users_list  where  id= ?",
      [orderAll[0].user_id]
    );
    if (user.length) {
      if (user[0].token !== "" && user[0].token !== null) {
        push.send(
          user[0].token,
          "Информация о клиенте",
          "Имя информационного клиента " +
          user[0].name +
          "Телифон " +
          user[0].phone +
          "Рейтинг " +
          user[0].phone,
          "",
          ""
        );
      }
    }
    if (rows.affectedRows) {
      socket.updateAllList("update-all-list", "1");
      appData.status = true;
    } else {
      appData.error = "Невозможно удалить контакт";
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
users.post("/delPhotoUser", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    file = req.body.filename,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  minioClient.removeObject("tirgo", req.body.filename).then(async () => {
    try {
      connect = await database.connection.getConnection();
      const [rows] = await connect.query(
        "UPDATE users_list_files SET active = 0 WHERE name = ? AND user_id = ?",
        [file, userInfo.id]
      );
      if (rows.affectedRows) {
        appData.status = true;
      } else {
        appData.error = "Невозможно удалить изображение";
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
});
users.post("/fonishOrderDriver", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    lat = req.body.lat,
    lng = req.body.lng,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    info = {},
    location = "",
    orderid = req.body.id;
  const isMerchant = req.body.isMerchant;
  try {
    connect = await database.connection.getConnection();
    info = await getCityFromLatLng(lat, lng);
    location = info.city + ", " + info.country;
    const [orderInfo] = await connect.query(
      "SELECT r.* FROM routes r LEFT JOIN orders o ON o.route_id = r.id WHERE o.id = ? LIMIT 1",
      [orderid]
    );
    if (orderInfo.length || isMerchant) {
      if (orderInfo[0].to_city === location) {
        const [rows] = await connect.query(
          "UPDATE orders SET status = 2,end_driver = 1 WHERE id = ?",
          [orderid]
        );
        if (rows.affectedRows) {
          socket.updateAllList("update-all-list", "1");
          appData.status = true;
        } else {
          appData.error = "Что то пошло не так";
        }
      } else {
        appData.status = true;
        socket.updateAllList("update-all-list", "1");
        await connect.query(
          "UPDATE orders SET status = 2,end_driver = 1 WHERE id = ?",
          [orderid]
        );
        await connect.query(
          "UPDATE users_list SET dirty = dirty + 1 WHERE id = ?",
          [userInfo.id]
        );
        appData.error =
          "К сожалению вы находитесь не в " +
          orderInfo[0].to_city +
          ". Данный заказ закрыт. Вы получили одно предупреждение.";
      }
    } else {
      appData.error =
        "Данный заказ возможно закрыть только через службу поддержку.";
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

users.post("/finishMerchantOrderDriver", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    location = " ",
    orderid =
      req.body.id.split("M").length > 1
        ? req.body.id.split("M")[1]
        : req.body.id,
    lat = req.body.lat,
    lng = req.body.lng,
    to_city = req.body.toCity;

  const amqp = require("amqplib");
  const connection = await amqp.connect("amqp://13.232.83.179:5672");
  const channel = await connection.createChannel();

  try {
    const info = await getCityFromLatLng(lat, lng);
    location = info.city + ", " + info.country;
    connect = await database.connection.getConnection();
    if (to_city === location) {
      const [rows] = await connect.query(
        "UPDATE orders_accepted SET status_order = 2 WHERE order_id = ?",
        [orderid]
      );
      if (rows.affectedRows) {
        connect.query(
          "UPDATE secure_transaction SET status = 1 WHERE orderid = ?",
          [orderid]
        );
        console.log(
          'channel.sendToQueue("finishOrderDriver", Buffer.from(orderid))',
          orderid,
          1
        );
        channel.sendToQueue(
          "finishOrderDriver",
          Buffer.from(JSON.stringify(orderid))
        );
        socket.updateAllList("update-all-list", "1");
        appData.status = true;
      } else {
        appData.error = "Что то пошло не так";
      }
    } else {
      appData.status = true;
      connect.query(
        "UPDATE secure_transaction SET status = 1 WHERE orderid = ?",
        [orderid]
      );
      socket.updateAllList("update-all-list", "1");
      console.log(
        'channel.sendToQueue("finishOrderDriver", Buffer.from(orderid))',
        orderid
      );
      channel.sendToQueue(
        "finishOrderDriver",
        Buffer.from(JSON.stringify(orderid))
      );
      await connect.query(
        "UPDATE orders_accepted SET status_order = 2 WHERE order_id = ?",
        [orderid]
      );
      await connect.query(
        "UPDATE users_list SET dirty = dirty + 1 WHERE id = ?",
        [userInfo.id]
      );
      appData.error =
        "К сожалению вы находитесь не в . Данный заказ закрыт. Вы получили одно предупреждение.";
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

users.get("/getMyTrack", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_transport WHERE user_id = ? AND active = 1",
      [userInfo.id]
    );
    if (rows.length) {
      appData.data = await Promise.all(
        rows.map(async (item) => {
          const [files] = await connect.query(
            "SELECT *,name as filename FROM users_transport_files WHERE transport_id = ?",
            [item.id]
          );
          let newItem = item;
          newItem.docks = await Promise.all(
            files.map(async (item2) => {
              let docks = item2;
              docks.preview = fs.existsSync(
                process.env.FILES_PATCH +
                "tirgo/drivers/" +
                userInfo.id +
                "/" +
                item2.filename
              )
                ? process.env.SERVER_URL +
                "tirgo/drivers/" +
                userInfo.id +
                "/" +
                item2.filename
                : null;
              return docks;
            })
          );
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
users.get("/getContacts", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_contacts WHERE user_id = ? AND verify = 1",
      [userInfo.id]
    );
    if (rows.length) {
      appData.data = rows;
      appData.status = true;
    } else {
      appData.error = "Нет контактов";
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
users.get("/getTypeTruck", async (req, res) => {
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
users.get("/getTypeCargo", async (req, res) => {
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
    appData.status = false;
    appData.error = err;
    res.status(403).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});
users.get("/getNotifyDriver", async (req, res) => {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM notifications WHERE user_id = ?",
      [userInfo.id]
    );
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
users.get("/getNotifyClient", async (req, res) => {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM notifications_clients WHERE user_id = ?",
      [userInfo.id]
    );
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
users.get("/getAllMessages", async (req, res) => {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM chat_support WHERE user_id = ?",
      [userInfo.id]
    );
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
users.post("/sendMessageSupport", async (req, res) => {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    message = req.body.message,
    data = {},
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "INSERT INTO chat_support SET text = ?, user_id = ?,type = ?",
      [message, userInfo.id, "text"]
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
users.post("/addBalance", async (req, res) => {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    amount = req.body.amount,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_list SET balance = balance + ? WHERE  id = ?",
      [+amount, userInfo.id]
    );
    if (rows.affectedRows) {
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
users.get("/getMyOrdersClient", async (req, res) => {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM orders WHERE user_id = ? AND status <> 2 ORDER BY id DESC",
      [userInfo.id]
    );
    if (rows.length) {
      appData.data = await Promise.all(
        rows.map(async (item) => {
          let newItem = item;
          newItem.transport_types = JSON.parse(item.transport_types);
          const [orders_accepted] = await connect.query(
            "SELECT ul.*,oa.price as priceorder,oa.one_day,oa.two_day,oa.three_day,oa.status_order FROM orders_accepted oa LEFT JOIN users_list ul ON ul.id = oa.user_id WHERE oa.order_id = ? ORDER BY oa.id DESC",
            [item.id]
          );
          newItem.orders_accepted = await Promise.all(
            orders_accepted.map(async (item2) => {
              let newItemUsers = item2;
              const [trucks] = await connect.query(
                "SELECT * FROM users_transport WHERE user_id = ? AND active = 1",
                [item2.id]
              );
              const [contacts] = await connect.query(
                "SELECT * FROM users_contacts WHERE user_id = ? AND verify = 1",
                [item2.id]
              );
              newItemUsers.contacts = contacts;
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
              newItemUsers.trucks = await Promise.all(
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
                        item2.id +
                        "/" +
                        filetruck.name
                      )
                        ? process.env.SERVER_URL +
                        "tirgo/drivers/" +
                        item2.id +
                        "/" +
                        filetruck.name
                        : null;
                      return docks;
                    })
                  );
                  return newTruck;
                })
              );
              return newItemUsers;
            })
          );
          const [route] = await connect.query(
            "SELECT * FROM routes WHERE id = ? LIMIT 1",
            [item.route_id]
          );
          newItem.route = route[0];
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

users.get("/getMyOrdersDriver", async (req, res) => {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    transportstypes = "",
    appData = { status: false, timestamp: new Date().getTime() };
  merchantData = [];
  try {
    const merchantCargos = await axios.get(
      "https://merchant.tirgo.io/api/v1/cargo/all-driver"
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
          date_create: el.createdAt,
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
          created_at: el.createdAt,
          logo: el.merchant?.logoFilePath,
          merchant: el.merchant,
        };
      });
    }

    connect = await database.connection.getConnection();
    const [transports] = await connect.query(
      "SELECT * FROM users_transport WHERE user_id = ? AND active = 1",
      [userInfo.id]
    );
    for (let transport of transports) {
      transportstypes = transportstypes + transport.type + ",";
    }
    transportstypes = transportstypes + "22,";
    transportstypes = transportstypes.substring(0, transportstypes.length - 1);
    let [rows] = await connect.query(
      "SELECT o.*,ul.name as usernameorder,ul.phone as userphoneorder FROM orders o LEFT JOIN users_list ul ON o.user_id = ul.id WHERE o.status <> 3 ORDER BY o.id DESC",
      [transportstypes, transportstypes]
    );
    if (rows.length) {
      appData.data = await Promise.all(
        [...merchantData, ...rows].map(async (item) => {
          let newItem = item;
          if (!item.isMerchant) {
            newItem.transport_types = JSON.parse(item.transport_types);
          }
          const [orders_accepted] = await connect.query(
            "SELECT ul.*,oa.price as priceorder,oa.status_order FROM orders_accepted oa LEFT JOIN users_list ul ON ul.id = oa.user_id WHERE oa.order_id = ?",
            [item.isMerchant ? +item.id.split("M")[1] : item.id]
          );
          newItem.orders_accepted = await Promise.all(
            orders_accepted.map(async (item2) => {
              let newItemUsers = item2;
              return newItemUsers;
            })
          );
          if (!item.isMerchant) {
            const [route] = await connect.query(
              "SELECT * FROM routes WHERE id = ? LIMIT 1",
              [item.route_id]
            );
            newItem.route = route[0];
          }
          return newItem;
        })
      );
      appData.status = true;
    } else {
      appData.error = "Нет заказов";
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

users.get("/getMyArchiveOrdersDriver", async (req, res) => {
  let connect,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    orders = [],
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM orders_accepted WHERE user_id = ?",
      [userInfo.id]
    );
    if (rows.length) {
      await Promise.all(
        rows.map(async (item) => {
          const [order] = await connect.query(
            "SELECT o.*,ul.name as usernameorder,ul.phone as userphoneorder FROM orders o LEFT JOIN users_list ul ON o.user_id = ul.id WHERE o.id = ? AND o.status = 3 ORDER BY o.id DESC",
            [item.order_id]
          );
          await Promise.all(
            order.map(async (item2) => {
              let newItem = item2;
              const [route] = await connect.query(
                "SELECT * FROM routes WHERE id = ? LIMIT 1",
                [item2.route_id]
              );
              newItem.route = route[0];
              orders.push(newItem);
            })
          );
        })
      );
      appData.data = orders;
      appData.status = true;
    } else {
      appData.error = "Нет заказов";
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
users.get("/getCurrency", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [currency] = await connect.query(
      "SELECT * FROM currency WHERE name_country IS NOT NULL"
    );
    appData.data = currency;
    appData.status = true;
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
users.get("/getStatuses", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [statuses] = await connect.query("SELECT * FROM users_status");
    appData.data = statuses;
    appData.status = true;
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

users.post("/createOrderClient", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    data = req.body.data,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    console.log(data);
    connect = await database.connection.getConnection();
    const [routes] = await connect.query(
      "SELECT * FROM routes WHERE from_city_id = ? AND to_city_id = ? LIMIT 1",
      [data.city_start_id, data.city_finish_id]
    );
    if (routes.length) {
      const [rows] = await connect.query(
        "INSERT INTO orders SET user_id = ?,price = ?,date_send = ?,add_two_days = ?,length_box = ?,width_box = ?,height_box = ?,transport_type = ?,weight = ?,type_cargo = ?,route_id = ?,mode = ?,loading = ?,cubic = ?,adr = ?,no_cash = ?,currency = ?,secure_transaction = ?",
        [
          userInfo.id,
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
          data.mode ? data.mode : 5,
          data.loading ? data.loading : 0,
          data.cubic ? data.cubic : 0,
          data.adr ? data.adr : 0,
          data.no_cash ? data.no_cash : 0,
          data.currency ? data.currency : "$",
          data.secure_transaction ? data.secure_transaction : 0,
        ]
      );
      if (rows.affectedRows) {
        if (data.secure_transaction) {
          await connect.query(
            "UPDATE users_list SET balance = balance - ? WHERE id = ?",
            [data.price, userInfo.id]
          );
          await connect.query(
            "INSERT INTO secure_transaction SET userid = ?,orderid = ?,amount = ?",
            [userInfo.id, rows.insertId, data.price]
          );
        }
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
          "INSERT INTO orders SET user_id = ?,price = ?,date_send = ?,add_two_days = ?,length_box = ?,width_box = ?,height_box = ?,transport_type = ?,weight = ?,type_cargo = ?,route_id = ?,mode = ?,loading = ?,cubic = ?,adr = ?,no_cash = ?,currency = ?,secure_transaction = ?",
          [
            userInfo.id,
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
            data.mode ? data.mode : 5,
            data.loading ? data.loading : 0,
            data.cubic ? data.cubic : 0,
            data.adr ? data.adr : 0,
            data.no_cash ? data.no_cash : 0,
            data.currency ? data.currency : "$",
            data.secure_transaction ? data.secure_transaction : 0,
          ]
        );
        if (rows.affectedRows) {
          if (data.secure_transaction) {
            await connect.query(
              "UPDATE users_list SET balance = balance - ? WHERE id = ?",
              [data.price, userInfo.id]
            );
            await connect.query(
              "INSERT INTO secure_transaction SET userid = ?,orderid = ?,amount = ?",
              [userInfo.id, rows.insertId, data.price]
            );
          }
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

users.post("/createOrderClientTypes", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    data = req.body.data,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [routes] = await connect.query(
      "SELECT * FROM routes WHERE from_city_id = ? AND to_city_id = ? LIMIT 1",
      [data.city_start_id, data.city_finish_id]
    );
    if (routes.length) {
      const [rows] = await connect.query(
        "INSERT INTO orders SET user_id = ?,price = ?,date_send = ?,add_two_days = ?,length_box = ?,width_box = ?,height_box = ?,transport_types = ?,weight = ?,type_cargo = ?,route_id = ?,mode = ?,loading = ?,cubic = ?,adr = ?,no_cash = ?,currency = ?,secure_transaction = ?",
        [
          userInfo.id,
          data.price,
          new Date(data.date_start),
          data.add_two_days,
          data.length_box,
          data.width_box,
          data.height_box,
          JSON.stringify(data.typestransport),
          data.weight,
          data.typecargo,
          routes[0].id,
          data.mode ? data.mode : 5,
          data.loading ? data.loading : 0,
          data.cubic ? data.cubic : 0,
          data.adr ? data.adr : 0,
          data.no_cash ? data.no_cash : 0,
          data.currency ? data.currency : "$",
          data.secure_transaction ? data.secure_transaction : 0,
        ]
      );
      if (rows.affectedRows) {
        if (data.secure_transaction) {
          await connect.query(
            "UPDATE users_list SET balance = balance - ? WHERE id = ?",
            [data.price, userInfo.id]
          );
          await connect.query(
            "INSERT INTO secure_transaction SET userid = ?,orderid = ?,amount = ?",
            [userInfo.id, rows.insertId, data.price]
          );
        }
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
          "INSERT INTO orders SET user_id = ?,price = ?,date_send = ?,add_two_days = ?,length_box = ?,width_box = ?,height_box = ?,transport_types = ?,weight = ?,type_cargo = ?,route_id = ?,mode = ?,loading = ?,cubic = ?,adr = ?,no_cash = ?,currency = ?,secure_transaction = ?",
          [
            userInfo.id,
            data.price,
            new Date(data.date_start),
            data.add_two_days,
            data.length_box,
            data.width_box,
            data.height_box,
            JSON.stringify(data.typestransport),
            data.weight,
            data.typecargo,
            routesadd.insertId,
            data.mode ? data.mode : 5,
            data.loading ? data.loading : 0,
            data.cubic ? data.cubic : 0,
            data.adr ? data.adr : 0,
            data.no_cash ? data.no_cash : 0,
            data.currency ? data.currency : "$",
            data.secure_transaction ? data.secure_transaction : 0,
          ]
        );
        if (rows.affectedRows) {
          if (data.secure_transaction) {
            await connect.query(
              "UPDATE users_list SET balance = balance - ? WHERE id = ?",
              [data.price, userInfo.id]
            );
            await connect.query(
              "INSERT INTO secure_transaction SET userid = ?,orderid = ?,amount = ?",
              [userInfo.id, rows.insertId, data.price]
            );
          }
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

users.post("/uploadImage", upload.single("file"), async (req, res) => {
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

users.post("/driver-balance/withdraw", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    userId = req.body.userId,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();
    const [row] = await connect.query(
      `SELECT *
      FROM users_list
      WHERE users_list.id = ? AND users_list.user_type = 1 AND users_list.ban <> 1 AND users_list.deleted <> 1;
      `,
      [userId]
    );
    if (row[0]) {
      const user = row[0];
      let [activeBalance] = await connect.query(
        `SELECT * from secure_transaction where dirverid = ? and status = 2`,
        [user.id]
      );
      let [withdrawals] = await connect.query(
        `SELECT * from driver_withdrawal where driver_id = ?`,
        [row[0]?.id]
      );
      const [subscriptionPayment] = await connect.query(
        `SELECT id, amount
    FROM subscription_transaction
    WHERE userid = ? AND deleted = 0
   AND COALESCE(agent_id, admin_id) IS NULL`,
        [user.id]
      );
      const [payments] = await connect.query(
        "SELECT amount FROM payment WHERE userid = ? and status = 1 and date_cancel_time IS NULL",
        [user.id]
      );
      let totalActiveAmount = activeBalance.reduce(
        (accumulator, secure) => accumulator + Number(secure.amount),
        0
      );
      let totalWithdrawalAmount = withdrawals.reduce(
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
      let amount =
        totalActiveAmount +
        (totalPayments - totalSubscriptionPayment) -
        totalWithdrawalAmount;

      if (amount <= 0) {
        appData.status = false;
        appData.error = "No enough balance";
        res.status(400).json(appData);
      } else {
        await connect.query(
          "INSERT INTO driver_withdrawal SET driver_id = ?,amount = ?, withdraw_type = 'Вывод средств', status = 0",
          [user.id, amount]
        );
        appData.status = true;

        [activeBalance] = await connect.query(
          `SELECT * from secure_transaction where dirverid = ? and status = 2`,
          [user.id]
        );
        [withdrawals] = await connect.query(
          `SELECT * from driver_withdrawal where driver_id = ?`,
          [row[0]?.id]
        );
        totalActiveAmount = activeBalance.reduce(
          (accumulator, secure) => accumulator + Number(secure.amount),
          0
        );
        totalWithdrawalAmount = withdrawals.reduce(
          (accumulator, secure) => accumulator + Number(secure.amount),
          0
        );
        const [withdrawalsProccess] = await connect.query(
          `SELECT * from driver_withdrawal where driver_id = ? and status = 0`,
          [user.id]
        );
        const [frozenBalance] = await connect.query(
          `SELECT * from secure_transaction where dirverid = ? and status <> 2`,
          [user.id]
        );
        // const [subscriptionPayment] = await connect.query(`SELECT id from subscription_transaction  where userid = ?`, [user.id]);
        // const [payments] = await connect.query("SELECT amount FROM payment WHERE userid = ? and status = 1 and date_cancel_time IS NULL",[user.id]);
        const totalWithdrawalAmountProcess = withdrawalsProccess.reduce(
          (accumulator, secure) => accumulator + Number(secure.amount),
          0
        );
        const totalFrozenAmount = frozenBalance.reduce(
          (accumulator, secure) => accumulator + Number(secure.amount),
          0
        );
        //   const totalPayments = payments.reduce((accumulator, secure) => accumulator + Number(secure.amount), 0);
        //   const totalSubscriptionPayment = subscriptionPayment.reduce((accumulator, subPay) => {
        //    if (subPay.duration === 1) {
        //      return accumulator + 80000;
        //    } else if (subPay.duration === 3) {
        //      return accumulator + 180000;
        //    } else if (subPay.duration === 12) {
        //      return accumulator + 570000;
        //    }
        //    // Default case when none of the conditions are met
        //    return accumulator;
        //  }, 0);

        const obj = {
          balance:
            totalActiveAmount +
            (totalPayments - totalSubscriptionPayment) -
            totalWithdrawalAmount,
          balance_in_proccess: totalWithdrawalAmountProcess,
          balance_off: totalFrozenAmount ? totalFrozenAmount : 0,
        };
        socket.emit(user.id, "update-driver-balance", JSON.stringify(obj));
        socket.emit(user.id, "update-driver-withdraw-request", "1");
        res.status(200).json(appData);
      }
    } else {
      appData.status = false;
      appData.error = "User not found";
      res.status(200).json(appData);
    }
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

users.get("/driver/withdrawals", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    connect = await database.connection.getConnection();

    const [rows] = await connect.query(
      `SELECT 
            wd.*,
            ul.name,
            ul.phone,
            ul.balance,
            v.bank_card,
            ul.id as driver_id
        FROM driver_withdrawal wd
        LEFT JOIN users_list ul ON wd.driver_id = ul.id
        LEFT JOIN verification v ON ul.id = v.user_id
        WHERE ul.user_type = 1 AND ul.ban <> 1 AND ul.deleted <> 1;
       `
    );

    if (rows.length) {
      for (let el of rows) {
        const [activeBalance] = await connect.query(
          `SELECT * from secure_transaction where dirverid = ? and status = 2`,
          [el.driver_id]
        );
        const [withdrawals] = await connect.query(
          `SELECT * from driver_withdrawal where driver_id = ?`,
          [el.driver_id]
        );
        const totalWithdrawalAmount = withdrawals.reduce(
          (accumulator, secure) => accumulator + Number(secure.amount),
          0
        );
        const totalActiveAmount = activeBalance.reduce(
          (accumulator, secure) => accumulator + Number(secure.amount),
          0
        );
        const [subscriptionPayment] = await connect.query(
          `SELECT id, amount
          FROM subscription_transaction
          WHERE userid = ? 
          AND deleted = 0
          AND agent_id = 0 
          AND (admin_id <> 0 OR admin_id IS NULL)`,
          [el.driver_id]
        );
        const [payments] = await connect.query(
          "SELECT amount FROM payment WHERE userid = ? and status = 1 and date_cancel_time IS NULL",
          [el.driver_id]
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

        el.balance =
          totalActiveAmount +
          (totalPayments - totalSubscriptionPayment) -
          totalWithdrawalAmount;
      }
      appData.status = true;
      appData.data = rows;
      res.status(200).json(appData);
    } else {
      appData.status = false;
      res.status(204).json(appData);
    }
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

users.patch("/verify-withdrawal/verify/:id", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    withdrawId = req.params.id;

  try {
    connect = await database.connection.getConnection();
    if (!withdrawId) {
      appData.status = false;
      appData.error = "Id is required";
      res.status(400).json(appData);
    }
    const [withdrawal] = await connect.query(
      "SELECT * FROM driver_withdrawal WHERE id = ? AND status = 0",
      [withdrawId]
    );

    if (withdrawal[0]) {
      // Update the withdrawal status to '1' (verified)
      await connect.query(
        "UPDATE driver_withdrawal SET status = 1 WHERE id = ?",
        [withdrawId]
      );

      appData.status = true;
      const [withdrawalsProccess] = await connect.query(
        `SELECT * from driver_withdrawal where driver_id = ? and status = 0`,
        [withdrawal[0].driver_id]
      );
      const [withdrawals] = await connect.query(
        `SELECT * from driver_withdrawal where driver_id = ?`,
        [withdrawal[0].driver_id]
      );
      const [frozenBalance] = await connect.query(
        `SELECT * from secure_transaction where dirverid = ? and status <> 2`,
        [withdrawal[0].driver_id]
      );
      const [activeBalance] = await connect.query(
        `SELECT * from secure_transaction where dirverid = ? and status = 2`,
        [withdrawal[0].driver_id]
      );
      const [subscriptionPayment] = await connect.query(
        `SELECT id, amount
         FROM subscription_transaction
         WHERE userid = ? AND deleted = 0 AND COALESCE(agent_id, admin_id) IS NULL`,
        [withdrawal[0].driver_id]
      );
      const [payments] = await connect.query(
        "SELECT amount FROM payment WHERE userid = ? and status = 1 and date_cancel_time IS NULL",
        [withdrawal[0].driver_id]
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

      const obj = {
        balance:
          totalActiveAmount +
          (totalPayments - totalSubscriptionPayment) -
          totalWithdrawalAmount,
        balance_in_proccess: totalWithdrawalAmountProcess,
        balance_off: totalFrozenAmount ? totalFrozenAmount : 0,
      };
      socket.emit(
        withdrawal[0].driver_id,
        "update-driver-balance",
        JSON.stringify(obj)
      );
      res.status(200).json(appData);
    } else {
      appData.status = false;
      appData.error = "Withdrawal not found or already verified";
      res.status(200).json(appData);
    }
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

users.post("/delUser", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    userid = req.body.userid;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "UPDATE users_list SET deleted = 1 WHERE id = ?",
      [userid]
    );
    if (rows.affectedRows) {
      appData.status = true;
    } else {
      appData.error = "Невозможно удалить аккаунт";
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

users.get("/subscription", async (req, res) => {
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

users.get("/checksubscription/:userid", async (req, res) => {
  const { userid } = req.params;
  let connect,
    appData = { status: false, timestamp: new Date().getTime() };
  try {
    connect = await database.connection.getConnection();
    const [user] = await connect.query(
      `SELECT id, to_subscription, from_subscription
       FROM users_list
       WHERE 
          to_subscription > CURDATE() 
          AND from_subscription IS NOT NULL 
          AND to_subscription IS NOT NULL
          AND id = ? 
         `,
      [userid]
    );
    if (user.length) {
      appData.status = true;
      appData.data = user;
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

users.post("/addDriverSubscription", async (req, res) => {
  let connect,
    appData = { status: false },
    balance;
  const { user_id, subscription_id, phone } = req.body;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_list WHERE phone = ?",
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

          if (rows[0]?.driver_group_id) {

            const [result] = await connect.query(`
            SELECT 
                (COALESCE(
                  (SELECT SUM(amount) FROM driver_group_transaction WHERE driver_group_id = ${rows[0]?.driver_group_id} AND type = 'Пополнение'), 0) -
                COALESCE(
                  (SELECT SUM(amount) FROM driver_group_transaction WHERE driver_group_id = ${rows[0]?.driver_group_id} AND type = 'Вывод'), 0)) -
        
                (COALESCE(
                  (SELECT SUM(amount) FROM subscription_transaction WHERE deleted = 0 AND group_id = ${rows[0]?.driver_group_id}), 0) +
                COALESCE(
                  (SELECT SUM(amount) FROM services_transaction WHERE group_id = ${rows[0]?.driver_group_id} AND status In(2, 3)), 0)) as balance;
            `);
            balance = result[0]?.balance;
          } else {
            const [result] = await connect.query(`
            SELECT 
                COALESCE(
                  (SELECT SUM(amount) from secure_transaction where dirverid = ${user_id} and status = 2), 0) +
  
                COALESCE(
                  (SELECT SUM(amount) FROM payment WHERE userid = ${user_id} and status = 1 and date_cancel_time IS NULL), 0) -
  
                COALESCE(
                  (SELECT SUM(amount) FROM subscription_transaction WHERE deleted = 0 AND userid = ${user_id} AND agent_id = 0 AND (admin_id <> 0 OR admin_id IS NULL)), 0) -
  
                COALESCE(
                  (SELECT SUM(amount) from driver_withdrawal where driver_id = ${user_id}) , 
                  0) as balance;
            `);
            balance = result[0]?.balance;
          }

          // const [activeBalance] = await connect.query(
          //   `SELECT * from secure_transaction where dirverid = ? and status = 2`,
          //   [user_id]
          // );
          // const [payments] = await connect.query(
          //   "SELECT amount FROM payment WHERE userid = ? and status = 1 and date_cancel_time IS NULL",
          //   [user_id]
          // );
          // const [subscriptionPayment] = await connect.query(
          //   `SELECT id, amount
          //   FROM subscription_transaction
          //   WHERE userid = ? 
          //   AND agent_id = 0 
          //   AND (admin_id <> 0 OR admin_id IS NULL)`,
          //   [user_id]
          // );

          // const [withdrawals] = await connect.query(
          //   `SELECT * from driver_withdrawal where driver_id = ?`,
          //   [user_id]
          // );

          // const totalWithdrawalAmount = withdrawals.reduce(
          //   (accumulator, secure) => accumulator + Number(secure.amount),
          //   0
          // );

          // const totalActiveAmount = activeBalance.reduce(
          //   (accumulator, secure) => accumulator + Number(secure.amount),
          //   0
          // );
          // const totalPayments = payments.reduce(
          //   (accumulator, secure) => accumulator + Number(secure.amount),
          //   0
          // );

          // const totalSubscriptionPayment = subscriptionPayment.reduce(
          //   (accumulator, subPay) => {
          //     return accumulator + Number(subPay.amount);
          //   },
          //   0
          // );
          // let balance = totalActiveAmount + (totalPayments - totalSubscriptionPayment) - totalWithdrawalAmount;

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
              if (rows[0]?.driver_group_id) {
                const subscription_transaction = await connect.query(
                  "INSERT INTO subscription_transaction SET userid = ?, subscription_id = ?, phone = ?, amount = ?, group_id = ?, is_group = ?",
                  [user_id, subscription_id, phone, valueofPayment, rows[0]?.driver_group_id, true]
                );
                if (subscription_transaction.length > 0) {
                  appData.status = true;
                  res.status(200).json(appData);
                }
              } else {
                const subscription_transaction = await connect.query(
                  "INSERT INTO subscription_transaction SET userid = ?, subscription_id = ?, phone = ?, amount = ?",
                  [user_id, subscription_id, phone, valueofPayment]
                );
                if (subscription_transaction.length > 0) {
                  appData.status = true;
                  res.status(200).json(appData);
                }
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
          appData.error = "Недостаточно средств на балансе";
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

users.get("/alpha-payment/:userid", async (req, res) => {
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
    const totalPaymentAmount = payment.reduce(
      (accumulator, secure) => accumulator + Number(secure.amount),
      0
    );
    if (payment.length) {
      appData.status = true;
      appData.data = { user: payment[0], total_amount: totalPaymentAmount };
      res.status(200).json(appData);
    } else {
      appData.error = "Пользователь не заплатил в сервисе Tirgo";
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

users.get("/services", async (req, res) => {
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

users.post("/services-transaction/user", async (req, res) => {
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
      without_subscription,
      rate,
      status,
      createAt
      FROM services_transaction st
      where userid = ? AND status <> 2
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

users.post("/addDriverServices", async (req, res) => {
  let connect,
    balance,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  appData = { status: false };
  const { user_id, phone, services } = req.body;
  try {
    if (!services) {
      appData.error = "Необходимо оформить подписку";
      return res.status(400).json(appData);
    }
    connect = await database.connection.getConnection();
    const [user] = await connect.query(
      "SELECT * FROM users_list WHERE id = ?",
      [user_id]
    );
    if (user.length < 1) {
      appData.error = " Не найден Пользователь";
      appData.status = false;
      res.status(400).json(appData);
    } else {

      const [editUser] = await connect.query(
        "UPDATE users_list SET is_service = 1  WHERE id = ?",
        [user_id]
      );
      if (editUser.affectedRows > 0) {
        const insertValues = services.map((service) => {
          return [
            user_id,
            service.services_id,
            userInfo.id,
            'service'
          ];
        });

        // let sql;
        // if(user[0]?.driver_group_id) {
        //   sql = 'INSERT INTO services_transaction (userid, service_id, service_name, price_uzs, price_kzs, rate, status, without_subscription, group_id, is_group) VALUES ?';
        // } else {
        //   sql = 'INSERT INTO services_transaction (userid, service_id, service_name, price_uzs, price_kzs, rate, status, without_subscription) VALUES ?';
        // }
        // const [result] = await connect.query(sql, [insertValues]);
        const [result] = await connect.query(`
            INSERT INTO tir_balance_transaction (user_id, service_id, created_by_id, transaction_type) VALUES ?
          `, [insertValues]);

        if (result.affectedRows > 0) {
          appData.status = true;
          res.status(200).json(appData);
        } else {
          appData.status = false;
          res.status(400).json(appData);
        }
      } else {
        appData.error = "Пользователь не может обновить";
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

users.post("/services-transaction/user/days", async (req, res) => {
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
      (select name from services where services.id = services_transaction.service_id) as name,
      price_uzs,
      price_kzs,
      without_subscription,
      rate,
      status,
      createAt
    FROM services_transaction 
    WHERE userid = ? AND createAt >= DATE_SUB(CURDATE(), INTERVAL 3 DAY)
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

users.post("/services-transaction/user/balanse", async (req, res) => {
  let connect,
    appData = { status: false };
  const { userid, phone } = req.body;
  try {
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
        `SELECT 
        COALESCE((SELECT SUM(amount) FROM alpha_payment WHERE userid = ? AND is_agent = false), 0) - 
        COALESCE ((SELECT SUM(amount) from services_transaction where userid = ? AND is_agent = false AND status In(2, 3)), 0)
        AS balance;`,
        [userid, userid]
      );
      appData.status = true;
      appData.data = { balance: paymentUser[0]?.balance };
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

users.get("/tir-coin-balance", async (req, res) => {
  let connect,
    appData = { status: false };
  const { userId } = req.query;
  try {

    if (!userId) {
      appData.status = false;
      appData.message = 'userId is required';
      res.status(400).json(appData);
      return;
    }

    connect = await database.connection.getConnection();

    const [user] = await connect.query(`
      SELECT id FROM users_list WHERE id = ${userId} AND user_type = 1
    `);
    if (!user.length) {
      appData.status = false;
      appData.message = 'Пользователь не найден';
      res.status(400).json(appData);
      return;
    }
    const [paymentUser] = await connect.query(
      `SELECT 
          COALESCE((SELECT SUM(amount_tir) FROM tir_balance_exchanges WHERE user_id = ${userId} AND balance_type = 'tirgo'), 0) -
          COALESCE((SELECT SUM(amount_tir) FROM tir_balance_transaction  WHERE deleted = 0 AND user_id = ${userId} AND created_by_id = ${userId} AND transaction_type = 'subscription'), 0) AS tirgoBalance,
          COALESCE((SELECT SUM(amount_tir) FROM tir_balance_exchanges WHERE user_id = ${userId} AND balance_type = 'tirgo_service'), 0) - 
          COALESCE((SELECT SUM(amount_tir) FROM tir_balance_transaction  WHERE deleted = 0 AND user_id = ${userId} AND created_by_id = ${userId} AND transaction_type = 'service' AND status In(2, 3)), 0) AS serviceBalance;`
    );
    appData.status = true;
    appData.data = paymentUser[0];
    res.status(200).json(appData);
  } catch (e) {
    console.log(e)
    appData.error = e.message;
    res.status(400).json(appData);
  } finally {
    if (connect) {
      connect.release();
    }
  }
});

users.post("/set-fcm-token", async (req, res) => {
  let connect,
    appData = { status: false };
  const { userId, fcmToken } = req.body;
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT id FROM users_list WHERE id = ?",
      [userId]
    );
    if (rows.length < 1) {
      appData.error = "Не найден Пользователь";
      appData.status = false;
      res.status(400).json(appData);
    } else {
      const [update] = await connect.query(
        `UPDATE users_list SET token = ? WHERE id = ?`,
        [fcmToken, userId]
      );
      if(update.affectedRows) {
        appData.status = true;
        res.status(200).json(appData);
      } else {
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

module.exports = users;
