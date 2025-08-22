# Security Policy

## 🔒 Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability, please follow these steps:

### DO NOT create a public GitHub issue for security vulnerabilities.

Instead:

1. **Email**: Send details to the repository owner (check GitHub profile for contact)
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## 🛡️ Security Considerations

### Client-Side Security
- All sensitive operations should be handled server-side
- Never store passwords or API keys in client-side code
- Validate all user inputs

### Google Sheets Integration
- Use proper authentication mechanisms
- Limit API key permissions
- Regular security audits of Apps Script code

### Data Protection
- Patient data should be anonymized when possible
- Follow healthcare data protection regulations
- Implement proper access controls

## 🔐 Best Practices

### For Developers
- Keep dependencies updated
- Use HTTPS for all communications
- Implement proper error handling
- Regular security reviews

### For Users
- Use strong passwords
- Keep browsers updated
- Report suspicious activities
- Follow organization's data policies

## 📝 Security Updates

Security updates will be:
- Released as soon as possible
- Documented in release notes
- Communicated through GitHub notifications

## 🤝 Responsible Disclosure

We appreciate security researchers who:
- Report vulnerabilities responsibly
- Allow time for fixes before public disclosure
- Provide detailed information to help us understand and fix issues

Thank you for helping keep this project secure! 🙏
