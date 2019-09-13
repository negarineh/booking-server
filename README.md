### Description
Booking system server written in NodeJs 

### Prerequisites
Node.js & npm installed.

### Steps to run
1.Visit : https://developers.google.com/calendar/quickstart/nodejs?authuser=2
<br>
Click on **ENABLE THE GOOGLE CALENDAR API** button step 1 <br>
In resulting dialog click **DOWNLOAD CLIENT CONFIGURATION** and save the file credentials.json to working directory.

2.Install dependencies.<br>
- npm install
<br>

3.Run the app
- npm start

The first time you run the sample, it will prompt you to authorize access:<br>

- Browse to the provided URL in your web browser.<br>
- If you are not already logged into your Google account, you will be prompted to log in. If you are logged into multiple Google accounts, you will be asked to select one account to use for the authorization.<br>
- Click the Accept button.<br>
- Copy the code you're given, paste it into the command-line prompt, and press Enter.<br>

Now the app is ready.<br>

4.check the endpoints by Postman<br>

- GET  /days?year=yyyy&month=mm
- GET  /timeslots?year=yyyy&month=mm&day=dd
- POST  /book?year=yyyy&month=MM&day=dd&hour=hh&minute=mm

