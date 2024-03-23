
const TelegramBot = require("node-telegram-bot-api");
const token = '6286374907:AAFIGJx3qBRR1qBuHzuSzMYMfuOW8amfF6A';
const bot = new TelegramBot(token, { polling: true });
const database = require("../Database/database");

bot.onText(/\/start/, (msg, match) => {
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
});

bot.on("contact", async (msg) => {
  let phoneNumber = msg.contact.phone_number.toString().replace('+', '');
  const chatId = msg.chat.id;
  let connect = await database.connection.getConnection();

  const [rows] = await connect.query(
    "SELECT * FROM users_contacts WHERE text = ? AND user_type = 2 LIMIT 1",
    [phoneNumber]
  );
  await connect.query(
    "UPDATE users_contacts SET verify = 1,  tg_chat_id = ? WHERE text = ?",
    [chatId, phoneNumber]
  );
  if (rows[0].is_tg) {
    bot.sendMessage(chatId, 'Код для логин: ' + rows[0].verify_code);
  } else {
    console.log('Login is not by tg')
  }
});


module.exports = {};
