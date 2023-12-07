const { app } = require("firebase-admin");
var Minio = require("minio");
var minioClient = new Minio.Client({
  endPoint: "185.183.243.223",
  port: 9000,
  useSSL: false,
  accessKey: "4iC87KDCglhYTPZGpA0D",
  secretKey: "1EnXPZiSEdHrJluSPgYLMQXuxbcSJF3TWIiklZDs",
});
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

// Multer configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Store files in the 'uploads' folder
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});
const upload = multer({
  limits: { fieldSize: 200 * 1024 * 1024 },
  storage: storage,
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
      "SELECT * FROM payment WHERE click_trans_id = ? LIMIT 1",
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
      console.log("refreshTokenSmsEskiz", rp_res);
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
    console.log(phone, code, country_code);
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
      console.log("refreshTokenSmsEskiz", rp_res_update);
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
      console.log(rp_res);
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
  console.log(phone);
  console.log(code);
  console.log(country_code);
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
  try {
    let rp_res = await rp(options);
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
  }
}
users.post("/findCity", async (req, res) => {
  console.log(req.body);
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
  console.log(req.body);
  let connect,
    appData = { status: false },
    country_code = req.body.country_code,
    send_sms_res = "",
    answerGetter,
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
            "Basic " + Buffer.from("tirgo1:TIRGOSMS").toString("base64"),
        },
      };
      await rp(options);
      send_sms_res = "waiting";
    } else {
      console.log(phone);
      sendpulse.init(
        API_USER_ID,
        API_SECRET,
        TOKEN_STORAGE,
        async function (res) {
          await sendpulse.smsSend(
            answerGetter,
            "test",
            ["+" + phone],
            "Confirmation code " + code
          );
        }
      );
      send_sms_res = "waiting";
    }
    const [rows] = await connect.query(
      "SELECT * FROM users_contacts WHERE text = ? AND user_type = 1 AND verify = 1",
      [phone]
    );
    if (rows.length > 0) {
      if (send_sms_res === "waiting") {
        await connect.query(
          "UPDATE users_contacts SET verify_code = ? WHERE text = ? AND user_type = 1",
          [code, phone]
        );
        appData.status = true;
      } else {
        appData.error = "Не удалось отправить SMS";
      }
    } else {
      if (send_sms_res === "waiting") {
        const [insert] = await connect.query(
          "INSERT INTO users_list SET verify_code=?,phone=?,user_type = 1",
          [code, phone]
        );
        await connect.query(
          "INSERT INTO users_contacts SET verify_code=?,text=?,user_type = 1,user_id = ?",
          [code, phone, insert.insertId]
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
users.post("/loginClient", async (req, res) => {
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
      //await sendSms(phone,code,country_code)
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
            "Basic " + Buffer.from("tirgo1:TIRGOSMS").toString("base64"),
        },
      };
      await rp(options);
      send_sms_res = "waiting";
    } else {
      sendpulse.init(
        API_USER_ID,
        API_SECRET,
        TOKEN_STORAGE,
        async function (res) {
          await sendpulse.smsSend(
            answerGetter,
            "test",
            ["+" + phone],
            "Confirmation code " + code
          );
        }
      );
      send_sms_res = "waiting";
    }
    const [rows] = await connect.query(
      "SELECT * FROM users_contacts WHERE text = ? AND user_type = 2",
      [phone]
    );
    if (rows.length > 0) {
      if (send_sms_res === "waiting") {
        await connect.query(
          "UPDATE users_contacts SET verify_code = ? WHERE text = ? AND user_type = 2",
          [code, phone]
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
          "INSERT INTO users_contacts SET verify_code=?,text=?,user_type = 2,user_id = ?",
          [code, phone, insert.insertId]
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
    phone = req.body.phone.replace(/[^0-9, ]/g, "").replace(/ /g, ""),
    code = req.body.code;
  try {
    console.log(phone);
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
      appData.status = true;
      appData.token = jwt.sign({ id: rows[0].user_id }, process.env.SECRET_KEY);
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
      appData.status = true;
      appData.token = jwt.sign({ id: rows[0].user_id }, process.env.SECRET_KEY);
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
// users.use((req, res, next) => {
//   let token =
//     req.body.token ||
//     req.headers["token"] ||
//     (req.headers.authorization && req.headers.authorization.split(" ")[1]);
//   let appData = {};
//   if (token) {
//     jwt.verify(token, process.env.SECRET_KEY, function (err) {
//       if (err) {
//         appData["error"] = err;
//         appData["data"] = "Token is invalid";
//         res.status(403).json(appData);
//       } else {
//         next();
//       }
//     });
//   } else {
//     appData["error"] = 1;
//     appData["data"] = "Token is null";
//     res.status(200).json(appData);
//   }
// });
users.post("/saveDeviceToken", async (req, res) => {
  console.log("/saveDeviceToken");
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
    answerGetter,
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
        send_sms_res = await sendSms(phone, code, country_code);
      } else if (phone.substr(0, 2) !== "79" && phone.substr(0, 2) !== "77") {
        sendpulse.init(
          API_USER_ID,
          API_SECRET,
          TOKEN_STORAGE,
          async function (res) {
            await sendpulse.smsSend(
              answerGetter,
              "test",
              ["+" + phone],
              "Confirmation code " + code
            );
          }
        );
        send_sms_res = "waiting";
      } else {
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
              "Basic " +
              Buffer.from("z1493225826616:191379").toString("base64"),
          },
        };
        await rp(options);
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
    if (rows.length) {
      const [config] = await connect.query("SELECT * FROM config LIMIT 1");
      appData.user = rows[0];
      appData.user.config = config[0];
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
      await connect.query(
        "INSERT INTO users_activity SET userid = ?,text = ?",
        [
          userInfo.id,
          "Произведен вход " +
            req.headers["user-agent"].split("(")[1].replace(")", "") +
            ",IP: " +
            parseIp(req).replace("::ffff:", ""),
        ]
      );
      socket.updateActivity("update-activity", "1");
    } else {
      res.status(200).json(appData);
    }
  } catch (err) {
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
  try {
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "SELECT * FROM users_list WHERE id = ? AND user_type = 2",
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
      await connect.query(
        "INSERT INTO users_activity SET userid = ?,text = ?",
        [
          userInfo.id,
          "Произведен вход " +
            req.headers["user-agent"].split("(")[1].replace(")", "") +
            ",IP: " +
            parseIp(req).replace("::ffff:", ""),
        ]
      );
      socket.updateActivity("update-activity", "1");
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
  console.log(req.body);
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
    one_day = 0,
    two_day = 0,
    three_day = 0,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
  try {
    if (dates.includes(0)) one_day = 1;
    if (dates.includes(1)) two_day = 1;
    if (dates.includes(2)) three_day = 1;
    connect = await database.connection.getConnection();
    const [rows] = await connect.query(
      "INSERT INTO orders_accepted SET user_id = ?,order_id = ?,price = ?,one_day = ?,two_day = ?,three_day = ?",
      [userInfo.id, orderid, price, one_day, two_day, three_day]
    );
    if (rows.affectedRows) {
      socket.updateAllList("update-all-list", "1");
      appData.status = true;
    } else {
      appData.error = "Невозможно принять заказ";
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
    if (rows.affectedRows) {
      appData.status = true;
      const [check_secure] = await connect.query(
        "SELECT * FROM secure_transaction WHERE orderid = ? LIMIT 1",
        [orderid]
      );
      if (check_secure.length) {
        await connect.query(
          "UPDATE secure_transaction SET dirverid = ? WHERE orderid = ?",
          [id, check_secure[0].id]
        );
        await connect.query(
          "UPDATE users_list SET balance = balance - ? WHERE id = ?",
          [price_off, userInfo.id]
        );
        await connect.query(
          "UPDATE users_list SET balance_off = balance + ? WHERE id = ?",
          [price_off, id]
        );
      }
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
  console.log(req.body.filename);
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    file = req.body.filename,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]);
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
users.post("/fonishOrderDriver", async (req, res) => {
  let connect,
    appData = { status: false, timestamp: new Date().getTime() },
    lat = req.body.lat,
    lng = req.body.lng,
    userInfo = jwt.decode(req.headers.authorization.split(" ")[1]),
    info = {},
    location = "",
    orderid = req.body.id;
  try {
    connect = await database.connection.getConnection();
    info = await getCityFromLatLng(lat, lng);
    console.log(req.body.lat);
    console.log(req.body.lng);
    location = info.city + ", " + info.country;
    console.log(info);
    console.log(location);
    const [orderInfo] = await connect.query(
      "SELECT r.* FROM routes r LEFT JOIN orders o ON o.route_id = r.id WHERE o.id = ? LIMIT 1",
      [orderid]
    );
    if (orderInfo.length) {
      console.log(orderInfo[0].to_city);
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
      "SELECT * FROM orders WHERE user_id = ? AND status <> 3 ORDER BY id DESC",
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
  try {
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
        rows.map(async (item) => {
          let newItem = item;
          const [orders_accepted] = await connect.query(
            "SELECT ul.*,oa.price as priceorder,oa.status_order FROM orders_accepted oa LEFT JOIN users_list ul ON ul.id = oa.user_id WHERE oa.order_id = ?",
            [item.id]
          );
          newItem.orders_accepted = await Promise.all(
            orders_accepted.map(async (item2) => {
              let newItemUsers = item2;
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
  console.log(req.body);
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

users.post(
  "/uploadImage",
  multer({ storage: multer.memoryStorage() }).single("file"),
  async (req, res) => {
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
      console.log(typeImage)
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
            console.log(appData);
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
            console.log(appData);
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
            console.log(appData);
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
            console.log(appData);
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
  }
);

module.exports = users;
