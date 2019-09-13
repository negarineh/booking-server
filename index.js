const express = require('express');
const app = express();
const _ = require('lodash');
const moment = require('moment');

const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';
let credential = null;
const DEFAULT_DAY = 1;
const DEFAULT_START_HOUR = 18;
const DEFAULT_END_HOUR = 18;
const DEFAULT_MINUTES = 59;

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  // Authorize a client with credentials, then call the Google Calendar API.
  credential = JSON.parse(content);
  authorize(JSON.parse(content), welcome);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Lists the next 10 events on the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listEvents(auth) {
  const calendar = google.calendar({version: 'v3', auth});
  calendar.events.list({
    calendarId: 'primary',
    timeMin: (new Date()).toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: 'startTime',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);
    const events = res.data.items;
    if (events.length) {
      console.log('Upcoming 10 events:');
      events.map((event, i) => {
        const start = event.start.dateTime || event.start.date;
        console.log(`${start} - ${event.summary}`);
      });
    } else {
      console.log('No upcoming events found.');
    }
  });
}

/* serving the server */

app.listen(3000, () => {
    console.log('App is listening to port 3000');
});

const welcome = () => {
    console.log("You're authorized to make an appointment");
}

/* GET Auth Page */
app.get('/auth', (req, res) => {
    // Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Calendar API.
    authorize(JSON.parse(content), listEvents);
});
})

/* bookable days
Requires a year and month.
GET  /days?year=yyyy&month=mm */
app.get('/days', (req, res) => {
    const month = parseInt(req.query.month);
    const year = parseInt(req.query.year);

    const days = getGeneralDays(year, month, 0);

    const tzoffsetMin = (new Date(year, month - 1, 1, 08, 59, 59)).getTimezoneOffset() * 60000;
    const localISOTimeMin = (new Date(new Date(year, month - 1, 1, 08, 59, 59) - tzoffsetMin)).toISOString();

    const tzoffsetMax = (new Date(year, month, days.length, 16, 0, 0)).getTimezoneOffset() * 60000;
    const localISOTimeMax = (new Date(new Date(year, month, days.length, 17, 0, 0) - tzoffsetMax)).toISOString();
    
    authorize(credential, (auth) => {
        getBookedDays(year, month, DEFAULT_DAY, DEFAULT_START_HOUR, DEFAULT_END_HOUR, DEFAULT_MINUTES, auth, localISOTimeMin, localISOTimeMax)
        .then((response) => {
            const bookableDays = [];
            let groups = {};
            
            groups = _.groupBy(response, (date) => {
                return moment(date.start.dateTime).startOf('day').format();
              });
            
            days.map((d, index) => {
                bookableDays.push({
                    day: index + 1,
                    hasTimeSlot: true,
                });
            });

            _.mapKeys(groups, (value, key) => {
                if (value.length >= 5) {
                    try {
                        value.every((elem,index,value)=>{
                            if ((new Date(value[index + 1].start.dateTime).getTime() - new Date(value[index].end.dateTime).getTime()) / 60000 >= 45) {
                                bookableDays.splice((new Date(key)).getDate() - 1, 1, {
                                        day: (new Date(key)).getDate(),
                                        hasTimeSlot: true,
                                    });
                                } else {
                                    bookableDays.splice((new Date(key)).getDate() - 1, 1, {
                                        day: (new Date(key)).getDate(),
                                        hasTimeSlot: false,
                                    });
                                }
                            return index <= value.length 
                        })
                    } catch(err) {
                        if (err instanceof TypeError) {
                            console.log('index of array reach the end');
                        }
                    }
                }
            });
            res.json({days: bookableDays});
        });
    });
});

/* available time slots
Requires a year, month, and day.
GET  /timeslots?year=yyyy&month=mm&day=dd */
app.get('/timeslots', (req, res) => {
    const year = req.query.year;
    const month = req.query.month;
    const day = req.query.day;

    const tzoffsetMin = (new Date(year, month - 1, day - 1, 17, 59, 59)).getTimezoneOffset() * 60000;
    const localISOTimeMin = (new Date(new Date(year, month - 1, day - 1, 17, 59, 59) - tzoffsetMin)).toISOString();

    const tzoffsetMax = (new Date(year, month - 1, day, 16, 59, 59)).getTimezoneOffset() * 60000;
    const localISOTimeMax = (new Date(new Date(year, month - 1, day, 16, 59, 59) - tzoffsetMax)).toISOString();
    
    authorize(credential, (auth) => {
        getBookedDays(year, month, day, DEFAULT_START_HOUR, DEFAULT_END_HOUR, DEFAULT_MINUTES, auth, localISOTimeMin, localISOTimeMax)
        .then((response) => {
            const timeSlots = [];
            let dList = [];

            let days = getGeneralDays(year, month, day);

            dList = getBookableDays(response, days);

            dList.map((v,i) => {
                timeSlots.push({
                    startTime: new Date(v),
                    endTime: new Date((v).setMinutes((v).getMinutes() + 40))
                })
            })
            
            res.json({timeSlots: timeSlots});
        });
    });

});

/* book an appointmnet
/* Requires a year, month, day, hour, and minute. */
/* POST  /book?year=yyyy&month=MM&day=dd&hour=hh&minute=mm */
app.post('/book', (req, res) => {
    const year = req.query.year;
    const month = req.query.month;
    const day = req.query.day;
    const hour = req.query.hour;
    const minute = req.query.minute;

    let success = true;
    let succesfullAppointment = {};

    const bookingTime = new Date(year, month - 1, day, hour, minute);

    if (bookingTime < new Date()){
        res.json({
            success : false,
            message : "Cannot book time in the past",
        })
        return
    }

    if (new Date(bookingTime.getTime()).setDate(bookingTime.getDate() - 1) < new Date()) {
        res.json({
            success : "false",
            message : "Cannot book with less than 24 hours in advance",
        })
        return;
    }

    if ((bookingTime.getHours() < 9 || bookingTime.getHours() > 17)
        || (bookingTime.getDay() === 6 || bookingTime.getDay() === 0)) {
        res.json({
            success : false,
            message : "Cannot book outside bookable timeframe",
        })
        return;
    }

    const tzoffsetMin = (new Date(year, month - 1, day - 1, hour, minute, 0)).getTimezoneOffset() * 60000;
    const localISOTimeMin = (new Date(new Date(year, month - 1, day - 1, hour, minute, 0) - tzoffsetMin)).toISOString();

    const tzoffsetMax = (new Date(year, month - 1, day, hour, minute, 0)).getTimezoneOffset() * 60000;
    const localISOTimeMax = (new Date(new Date(year, month - 1, day, hour, minute, 0) - tzoffsetMax)).toISOString();

    authorize(credential, (auth) => {
        getBookedDays(year, month, day, DEFAULT_START_HOUR, DEFAULT_END_HOUR, DEFAULT_MINUTES, auth, localISOTimeMin, localISOTimeMax)
        .then((response) => {
            const days = getGeneralDays(year, month, day, hour, minute);
            const bookableDaysList = getBookableDays(response, days);
            
            if (bookableDaysList.length) {
                bookableDaysList.map((event, i) => {
                if ((event[i]).getTime() === bookingTime.getTime()) {
                    res.json({
                        success,
                        message: 'Invalid time slot',
                    })
                }
                });
            } else {
                res.json({
                    success,
                    message: 'Invalid time slot',
                });
            }
            

            const event = {
                summary: 'DigitalAngels',
                description: 'DigitalAngels',
                start: {
                    dateTime: bookingTime.toISOString(),
                },
                end: {
                    dateTime: new Date(bookingTime.getTime() + 40 * 60 * 1000).toISOString(),
                },
            };
            
            const calendar = google.calendar({version: 'v3', auth});
            calendar.events.insert({
                calendarId: 'primary',
                resource: event,
            }, function(err, event) {
                if (err) {
                    console.log('There was an error contacting the Calendar service: ' + err);
                    success = false;
                    res.json({
                        success,
                        message: 'Invalid time slot',
                    });
                return;
                }
                    succesfullAppointment = {
                        success,
                        startTime: bookingTime.toISOString(),
                        endTime: new Date(bookingTime.getTime() + 40 * 60 * 1000).toISOString(),
                    }
                    res.json(succesfullAppointment)
                    console.log('Event created: '+ event.htmlLink);
            });
        });
    });
})

/* get number of days in specific month */
const getGeneralDays = (year, month, day) => {
    const generalDays = [];
    const daysOfMonth = new Date(year, month, 0).getDate();
    if (day > 0) {
        for (let i=0; i< 10; i++) {
            generalDays.push((new Date(year, month - 1, day, 19, i * 45)));
        }
    } else {
        for (let i=1; i<= daysOfMonth; i++) {
            if (new Date(year, month - 1, i, 9, 0).getDay() > 0 && new Date(year, month - 1, i, 9, 0).getDay() < 6 ) {
                 generalDays.push((new Date(year, month - 1, i, 9, 0)));
            }
           
        }
    }
    
    return generalDays;
}

/* get booked days in specific year and month */
const getBookedDays = (year, month, day, sHour, eHour, minutes, auth, timeMins, timeMaxs) => {
    return new Promise(async (resolve, reject) => {
    let daysList = [];
    
    const calendar = google.calendar({version: 'v3', auth});
    await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMins, //(new Date(year, month - 1, day, sHour, minutes)).toISOString(),
        timeMax: timeMaxs, //(new Date(year, month, day, eHour, minutes)).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
    }, (err, response) => {
            if (err) return console.log('The API returned an error: ' + err);
            const events = response.data.items;
            if (events.length) {
                console.log('Upcoming events:');
                events.map((event, i) => {
                    const start = event.start.dateTime || event.start.date;
                    console.log(`${start} - ${event.summary}`);
                    daysList = events;
                });
            } else {
                console.log('No upcoming events found.');
            }
            resolve(daysList);
        });
    })
}

const getBookableDays = (bookedDays, days) => {
    let bookedList = [];
    let dList = [...days];

    bookedDays.map((event, i) => {
            const tzoffset = (new Date(event.start.dateTime)).getTimezoneOffset() * 60000;
            const localISOTime = (new Date(new Date(event.start.dateTime) - tzoffset));
        bookedList.push(localISOTime);
    });

    for (let i = 0; i < bookedList.length; i++) {
        for (let j = 0; j < days.length; j++) {
            if (days[j].getTime() === bookedList[i].getTime()) {
                dList[j] = null;
                break;
            }
        }
    }

    dList = dList.filter(item => item !== null);

    return dList;
}