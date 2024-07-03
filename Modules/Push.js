const admin = require('firebase-admin');
let serviceAccountCarrier = require('../firebase-fcm-driver-private-key.json');
let serviceAccountClient = require('../firebase-fcm-client-private-key.json');

const carrierAdmin = admin.initializeApp({
    credential: admin.credential.cert(serviceAccountCarrier)
}, 'carrier');

const clientAdmin = admin.initializeApp({
    credential: admin.credential.cert(serviceAccountClient)
}, 'client');

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
        return carrierAdmin.messaging().send(payload)
            .then((response) => {
                // Response is a message ID string.
                console.log('Successfully sent message: ' + title + ' | ', response);
            })
            .catch(async (error) => {
                console.log('Error: ', error);
            });
    },
    sendToCarrierDevice: (token, title, body, targetID='', targetType='', image='', otherData='') => {
        console.log('drivers', token, title, body, targetID, targetType, image, otherData)
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
          
        return carrierAdmin.messaging().send(message)
            .then((response) => {
                // Response is a message ID string.
                console.log('Successfully sent message: ' + title + ' | ', response);
            })
            .catch(async (error) => {
                console.log('Error: ', error);
            });
    },
    sendToClientDevice: (token, title, body, icon, targetID='', targetType='', image='', otherData='') => {
        try {
            console.log('clients', token, title, body, targetID, targetType, image, otherData)
        const message = {
            data: {
              score: '850',
              time: '2:45'
            },
            notification: {
                title: title,
                body: body,
              },
      
            token: token
          };
          
        return clientAdmin.messaging().send(message)
            .then((response) => {
                // Response is a message ID string.
                console.log('Successfully sent message: ' + title + ' | ', response);
            })
            .catch((error) => {
                console.log('Error: ', error);
            });
        } catch(err) {
            console.log(err)
        }
    },
    subscribeToTopic(token, topic) {
        console.log('Subscribe to topic: ', topic, token)
        try {
            if(topic == 'clients') {
              clientAdmin.messaging().subscribeToTopic(token, topic);
            } else if(topic == 'drivers') {
                carrierAdmin.messaging().subscribeToTopic(token, topic).then((data) => {
                    console.log(data)
                });
            }
        } catch(err) {
            console.log(err)
        }
    },
    sendToTopic(topic, title, body) {
        try {
            console.log(topic, title, body)
        const message = {
            data: {
              score: '850',
              time: '2:45'
            },
            notification: {
                title: title,
                body: body,
              },
      
            topic: topic
          };
          
          if(topic == 'clients') {
              return clientAdmin.messaging().send(message)
                  .then((response) => {
                      // Response is a message ID string.
                      console.log('Successfully sent message clients: ' + title + ' | ', response);
                  })
                  .catch((error) => {
                      console.log('Error: ', error);
                  });
          } else if(topic == 'drivers') {
            return clientAdmin.messaging().send(message)
            .then((response) => {
                // Response is a message ID string.
                console.log('Successfully sent message drivers: ' + title + ' | ', response);
            })
            .catch((error) => {
                console.log('Error: ', error);
            });
          } else if(topic == 'all') {
            Promise.all(clientAdmin.messaging().send({
                data: {
                  score: '850',
                  time: '2:45'
                },
                notification: {
                    title: title,
                    body: body,
                  },
          
                topic: 'clients'
              }), carrierAdmin.messaging().send({
                data: {
                  score: '850',
                  time: '2:45'
                },
                notification: {
                    title: title,
                    body: body,
                  },
          
                topic: 'drivers'
              })).then((data) => {
                  // Response is a message ID string.
                  console.log('Successfully sent to All: ', data);
              });
          }
        } catch(err) {
            console.log(err)
        }
    }
};
