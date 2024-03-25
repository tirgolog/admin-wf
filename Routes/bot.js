
const TelegramBot = require("node-telegram-bot-api");
const token = '6286374907:AAEvEgm_NDDv-r6ppBEy-qvoJGWFKCb_Rbw';
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
  let phoneNumber = msg.contact.phone_number.toString().replace('+', '');
  const chatId = msg.chat.id;
  let connect = await database.connection.getConnection();

  const [rows] = await connect.query(
    "SELECT * FROM users_contacts WHERE text = ? LIMIT 1",
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

bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;
    console.log('Text on message', text, 'UserId', chatId)
  } catch (err) {
    console.log('Error on message: ', err)
  }
});

async function sendBotMessageToUser(chatId, text) {
  bot.sendMessage(chatId, 'Код для логин: ' + text);
}

module.exports = {sendBotMessageToUser};
