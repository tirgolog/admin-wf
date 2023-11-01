const
    adminCarrier = require('firebase-admin'),
    serviceAccountCarrier = require('../iotirgocarrier-firebase-adminsdk-dudei-c8255afe79.json');

adminCarrier.initializeApp({
    credential: adminCarrier.credential.cert(serviceAccountCarrier),
    databaseURL: "https://iotirgocarrier.firebaseio.com"
});
module.exports = {
    send: (token, title, body, targetID='', targetType='', image='', otherData='') => {
        console.log(token, title, body, targetID, targetType, image, otherData)
        let payload = {
            data: {
                targetID: ''+targetID,
                targetType: targetType,
                mydata: JSON.stringify(otherData),
            },
            android: {
                priority: "high",
                ttl: 60 * 60 *24,
                data: {
                    title: title ? title : '',
                    body: body ? body : '',
                    sound: 'default',
                    style: "inbox",
                    vibrate: '1',
                }
            },
            apns: {
                headers: {
                    'apns-priority': '5',
                },
                payload: {
                    aps: {
                        alert: {
                            title: title ? title : '',
                            body: body ? body : '',
                        },
                        sound: 'default',
                        badge: 1,
                        "mutable-content":"1"
                    },
                },
                fcm_options: {
                    image: 'https://foo.bar.pizza-monster.png'
                }
            },
            token: token
        };
        return adminCarrier.messaging().send(payload)
            .then((response) => {
                // Response is a message ID string.
                console.log('Successfully sent message: ' + title + ' | ', response);
            })
            .catch(async (error) => {
                console.log('Error: ');
            });
    },
};
