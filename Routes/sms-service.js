const sendpulse = require("sendpulse-api");
const rp = require("request-promise");

async function sendTextSmsPlayMobile(phone, text) {
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
                text
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
      console.log(err)
      return false;
    } finally {
      console.log("finally");
    }
  }
  
async function sendTextSmsOson(phone, text) {
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
    const message = text;
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

async function sendTextSms(phone, text) {
    if (phone.substr(0, 3) === "998") {
        send_sms_res = await sendTextSmsPlayMobile(phone, text);
        console.log("send_sms_res1", send_sms_res);
        //send_sms_res = await sendSms(phone,code,country_code)
      } else if (phone.substr(0, 3) === "992") {
        send_sms_res = await sendTextSmsOson(phone, text);
        console.log("send_sms_res2", send_sms_res);
        //send_sms_res = await sendSms(phone,code,country_code)
      } else if (phone.substr(0, 2) === "79") {
        let options = {
          method: "GET",
          uri:
            "http://api.iqsms.ru/messages/v2/send/?phone=" +
            phone +
            "&text="+text,
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
              text
            );
          }
        );
        send_sms_res = "waiting";
      }
  }

  module.exports = { sendTextSms }