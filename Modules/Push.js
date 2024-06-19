const adminCarrier = require('firebase-admin');
let serviceAccountCarrier; 
    serviceAccountCarrier = require('../../firebase/firebase-fcm-private-key.json');


adminCarrier.initializeApp({
    credential: adminCarrier.credential.cert(serviceAccountCarrier)
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
                console.log('Error: ', error);
            });
    },
    sendToDevice: (token, title, body, targetID='', targetType='', image='', otherData='') => {
        console.log(token, title, body, targetID, targetType, image, otherData)
        const message = {
            data: {
              score: '850',
              time: '2:45'
            },
            notification: {
                title: title,
                body: body
              },
            token: token
          };
          
        return adminCarrier.messaging().send(message)
            .then((response) => {
                // Response is a message ID string.
                console.log('Successfully sent message: ' + title + ' | ', response);
            })
            .catch(async (error) => {
                console.log('Error: ', error);
            });
    },
};
