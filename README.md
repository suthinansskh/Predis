# Predispensing Error Recorder

A web application for recording and tracking medication predispensing errors using Google Sheets as a database.

## ⚠️ IMPORTANT: Before Using This Application

**This repository contains template code with placeholder credentials.** 

🔒 **You MUST configure your own Google Sheets and API credentials before use.**

👉 **See [ENVIRONMENT_CONFIG.md](ENVIRONMENT_CONFIG.md) for setup instructions.**

## Features

- **Error Reporting Form**: Comprehensive form to record predispensing errors with all relevant details
- **Dashboard**: View statistics and recent errors with filtering capabilities
- **Google Sheets Integration**: Automatically saves data to Google Sheets for easy access and analysis
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Local Configuration**: Settings are saved locally in the browser

## Setup Instructions

### 1. Google Sheets Setup

1. Create a new Google Sheet
2. Add the following column headers in row 1:
   - A1: `Timestamp`
   - B1: `Reporter_ID`
   - C1: `Patient_ID`
   - D1: `Medication_Name`
   - E1: `Prescribed_Dose`
   - F1: `Actual_Dose`
   - G1: `Error_Type`
   - H1: `Severity`
   - I1: `Cause_Category`
   - J1: `Description`
   - K1: `Actions_Taken`
   - L1: `Preventive_Measures`

3. Make note of your Spreadsheet ID (found in the URL between `/d/` and `/edit`)

### 2. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Sheets API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"
4. Create credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the generated API key
   - (Optional) Restrict the API key to Google Sheets API for security

### 3. Sheet Permissions

Choose one of these options:

**Option A: Public Access (Simpler)**
- Make your Google Sheet publicly viewable
- Go to Share > "Anyone with the link can view"

**Option B: Service Account (More Secure)**
- Create a service account in Google Cloud Console
- Download the JSON key file
- Share your Google Sheet with the service account email
- Modify the application to use service account authentication

### 4. Application Configuration

1. Open the web application in your browser
2. Go to the "Settings" tab
3. Enter your:
   - Google Sheets API Key
   - Spreadsheet ID
   - Sheet Name (default: "Predispensing_Errors")
4. Click "Save Settings"

## Usage

### Recording Errors

1. Click "Report Error" in the navigation
2. Fill out all required fields:
   - Date & Time (auto-populated)
   - Reporter ID
   - Patient ID (anonymized)
   - Medication details
   - Error type and severity
   - Detailed description
   - Actions taken
   - Preventive measures
3. Click "Submit Error Report"

### Viewing Dashboard

1. Click "Dashboard" in the navigation
2. Click "Refresh Data" to load from Google Sheets
3. View statistics and recent errors
4. Use the filter dropdown to filter by error type

## Data Fields

| Field | Description | Required |
|-------|-------------|----------|
| Timestamp | Date and time of the error | Yes |
| Reporter ID | ID of person reporting | Yes |
| Patient ID | Anonymized patient identifier | Yes |
| Medication Name | Name of the medication | Yes |
| Prescribed Dose | Correct dose as prescribed | Yes |
| Actual Dose | Dose that was actually prepared | Yes |
| Error Type | Category of error (Wrong Dose, Wrong Medication, etc.) | Yes |
| Severity | Impact level (Low, Medium, High, Critical) | Yes |
| Cause Category | Root cause category | Yes |
| Description | Detailed description of the error | Yes |
| Actions Taken | Corrective actions performed | Yes |
| Preventive Measures | Suggested prevention methods | No |

## Error Types

- **Wrong Dose**: Incorrect dosage amount
- **Wrong Medication**: Different medication than prescribed
- **Wrong Patient**: Medication prepared for wrong patient
- **Wrong Route**: Incorrect administration route
- **Wrong Time**: Medication prepared at wrong time
- **Omission**: Medication not prepared when required
- **Other**: Other types of errors

## Severity Levels

- **Low**: No harm to patient
- **Medium**: Potential for harm
- **High**: Harm occurred
- **Critical**: Severe harm

## Security Considerations

- Patient IDs should be anonymized
- Store API keys securely
- Consider using service account authentication for production
- Regularly review Google Cloud Console access logs
- Implement user authentication for production use

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## File Structure

```
predis/
├── index.html          # Main application file
├── styles.css          # Styling and layout
├── script.js           # JavaScript functionality
├── README.md           # This file
└── .github/
    └── copilot-instructions.md
```

## Troubleshooting

### Common Issues

1. **"Failed to save to Google Sheets"**
   - Check API key is correct
   - Verify Spreadsheet ID
   - Ensure Google Sheets API is enabled
   - Check sheet permissions

2. **"No data available"**
   - Click "Refresh Data" button
   - Verify sheet has data
   - Check sheet name matches configuration

3. **CORS Errors**
   - Google Sheets API should work from any domain
   - If using service account, ensure proper CORS setup

### Getting Help

1. Check browser console for error messages
2. Verify Google Cloud Console API quotas
3. Test API key with Google Sheets API Explorer
4. Ensure all required columns exist in your sheet

## Development

To run locally:
1. Open `index.html` in a web browser
2. Or use a local server like Live Server extension in VS Code

## License

This project is open source and available under the MIT License.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

For questions or support, please refer to the troubleshooting section above.
