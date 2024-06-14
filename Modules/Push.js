const adminCarrier = require('firebase-admin');
const serviceAccountCarrier = {
    "type": "service_account",
    "project_id": "tirgo-log",
    "private_key_id": "1dfd239637da395ad11e678422f0c447f082f086",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCouA9qadylvIi5\nTXJCzKAXsCDp5lXPlYtiSEp0dHSgd1p6u04eGnLkD5vJ5Hlz/d1fV7fdVpP/8ccO\nGjh6nTeKqO5KGTQ1YgZpl1VpZE/G280Kk76s3m9lKJogoIiIafZOHFHHstBkWZZD\nUMtM40Gsl6RJzwSxcoGulMfpa+3qZylFYbv6Hqky7DSwQ+g7w6rWAvkZDgAYLn35\nbYQgNEv20FttCyMc+1rBbOyJs9lK4vAmPseh2CkSLZpXbqRVmukp1wIC+/mnoLAJ\n5KXISzH1fFT8DH/znLM/tMTfsutY2V02aP/cGlAmsQ5OELj6aIZDxpjWKD7jlsjD\nPEs6X9zXAgMBAAECggEAHQN58yy9OusO//6ndYFGzowFPPPVMdtfmskftKMKI0Yj\nExP+vQKDW2Crw648jIvNc8Xb4n4u+UaUmoI70CoVEQ033Ro0djGjNKlHkNYlOec2\nfWkm0wd1VIoE5zN0BzFhn9ES5yqC157oTi8optI1yv5QzDiDcBhm4KTJNATRZwuK\nprhwKPca8XTWBqKn/1oB0Hn0e+F3WVL++gdxhioZx2U9ex6qd6Cs8dt5UG2xBoo0\nJN4SUlQgkQl48D2B/7kwt8qh20x8Zv3faXVQ2l/KVRDvhfKhRAUysX4gvA7coGjy\n/FxNaD7heKReKrw18TzNQPIdKS6B5Cu/dLwvo00EcQKBgQDk/bwYY/sAMGV2hdpm\nAVdXGS8FYw1i2o6ODADgjWq1FEmdtLU50eljXarsHDC5m+YFlD4WfrOUYbMlCbpi\nEFr9mb6VynrIuMD7lSyBEnMbum0uavFf2F+lpM25mk10IcL3MhgHl/r5qxSJb99a\nLc+ZsfFZPbEE2TUtDrVfCZP/pQKBgQC8nnCObfM7yFXH2rY55yYzm3y/1U4XKGak\niQOF9jKUiK/40Rd/173z4SLVIod/WscQ2AGHMiuOh6K1xpWK4rrMmj26opOkhQ9x\nansflXAJCVRfhDNETLOcMfw1m6HfW6sms+AUpcqGmrwewsouvxZv3n0FMCpJ7P78\nx2OGHsqBywKBgQDhf0BwIFy3VfFEoxFrq9xvZ9xXCLDQ7Pq+xPFEL96pzP2lcKOZ\n+a1D7aR4eFY/IVeFnPL7Qe/jqcY5Lfg9w29nFrSIW2lIKi/YT5EQ1bNG1fHYaPWi\n9bdSrhTstheZyfltZgYlzDMZE7DYmrMu4bfy2TkbMVYVuTPVWAuhOBRnBQKBgDa7\nXvvlacQ6MLIKhAAvU8V74+oickOEBKzP2UbhFvJE65Mu0TvWlZcUCDCCkYDiDYuU\nsnTRmRQFxbArjK89dWjzhOAIVwFRXxbRCCM1EMp+e44v5VR3UVMMqhvAKmuOxQ44\n+dfj9+2xLs9aRKLl7hPOIscDn/HNpHwjO3zqqGabAoGAPTjkI7102eMVl6vYRPv6\nsNww2NliuDmQnoPGVKFMIXC9QBZg+Ga8wmDC3G5LgIiyObhn/1Oqwcp3Q1ZRQAGN\nMVqDjuiz6KwGPKUmDwZ7Dyr4q9BqgQNjnnll8RYokLVFDIDy7Nzukbfg9ibL2/TG\nDBfXIL6YdlvoY0uqidjsK+4=\n-----END PRIVATE KEY-----\n",
    "client_email": "firebase-adminsdk-ml9g7@tirgo-log.iam.gserviceaccount.com",
    "client_id": "110173028074792510528",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-ml9g7%40tirgo-log.iam.gserviceaccount.com",
    "universe_domain": "googleapis.com"
  }
  ;

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
