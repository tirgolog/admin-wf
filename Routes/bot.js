
const TelegramBot = require("node-telegram-bot-api");
const token = '6286374907:AAFIGJx3qBRR1qBuHzuSzMYMfuOW8amfF6A';
const bot = new TelegramBot(token, { polling: true });
const database = require("../Database/database");

bot.onText(/\/start/, (msg, match) => {
  try {
    const chatId = msg.chat.id;
    let replyOptions = {
      reply_markup: {
        resize_keyboard: true,
        one_time_keyboard: true,
        force_reply: true,
        keyboard: [[{ text: "contact", request_contact: true }]],
      },
    };
    const text = `Добро пожаловать, ${msg.from.first_name} ${msg.from.last_name} ! \nПожалуйста отправьте свой номер телефона !`;
    bot.sendMessage(chatId, text, replyOptions);
  } catch (err) {
    console.log('Error on start: ', err)
  }
});

bot.on("contact", async (msg) => {
  try {
    let phoneNumber = msg.contact.phone_number.toString().replace('+', '');
    const chatId = msg.chat.id;
    let connect = await database.connection.getConnection();

    await connect.query(
      "UPDATE users_contacts SET verify = 1,  tg_chat_id = ? WHERE text = ?",
      [chatId, phoneNumber]
    );

    // Prompt user to select client or driver
    let replyOptions = {
      reply_markup: {
        resize_keyboard: true,
        one_time_keyboard: true,
        force_reply: true,
        keyboard: [
          [{ text: "Client" }, { text: "Driver" }]
        ],
      },
    };
    bot.sendMessage(chatId, "Please select your role:", replyOptions);
  } catch (err) {
    console.log('Error on contact: ', err)
  }
});

bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;
    let connect = await database.connection.getConnection();
    // Check if the message is a response to the role selection prompt
    if (text === "Client" || text === "Driver") {
      // Now you have the user's selected role, you can handle it here
      console.log("User selected role:", text);

      if (text === "Driver") {
        const [rows] = await connect.query(
          "SELECT * FROM users_contacts WHERE user_type = 1 AND tg_chat_id = ? LIMIT 1",
          [chatId]
        );
        if (rows.length > 0) {
          if (rows[0].is_tg) {
            bot.sendMessage(chatId, 'Код для логина: ' + rows[0].verify_code);
          } else {
            console.log('Login is not by Telegram');
          }
        } else {
          console.log("User not found");
        }
      }
      if (text === "Client") {
        const [rows] = await connect.query(
          "SELECT * FROM users_contacts WHERE tg_chat_id = ? AND user_type = 2 LIMIT 1",
          [chatId]
        );
        if (rows.length > 0) {
          if (rows[0].is_tg) {
            bot.sendMessage(chatId, 'Код для логина: ' + rows[0].verify_code);
          } else {
            console.log('Login is not by Telegram');
          }
        } else {
          console.log("User not found");
        }
      }

    }
  } catch (err) {
    console.log('Error on message: ', err)
  }
});



module.exports = {};
