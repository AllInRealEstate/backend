const nodemailer = require('nodemailer');

//  1. Configure the Nodemailer Transporter for Cloud Servers
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,        
    secure: false,    
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
    },
    tls: {
        rejectUnauthorized: false
    }
});

// 2. Helper function to handle the actual sending
const sendEmail = async (toEmails, subject, htmlContent) => {
    // --- GUARD CLAUZES ---
    // Ensure we have an array to work with
    const recipients = Array.isArray(toEmails) ? toEmails : [toEmails];

    // Filter out invalid entries (null, undefined, or empty strings)
    const validRecipients = recipients.filter(email =>
        email && typeof email === 'string' && email.trim() !== ''
    );

    // If no valid emails are left, do not call transporter.sendMail
    if (validRecipients.length === 0) {
        console.warn(`⚠️ Email skipped: No valid recipients found for "${subject}"`);
        return false;
    }

    try {
        const info = await transporter.sendMail({
            from: `"All-In CRM" <${process.env.GMAIL_USER}>`,
            to: validRecipients.join(', '), // Combine into "email1@test.com, email2@test.com"
            subject: subject,
            html: htmlContent,
        });
        console.log(`📧 Email sent via Gmail to [${validRecipients}]: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('❌ Gmail SMTP Error:', error);
        return false;
    }
};

// 3. Keep your exact function names so the rest of the app doesn't break
const emailService = {

    sendLeadNotification: async (lead, adminEmails) => {
        const subject = `🚨 New Lead: ${lead.fullName} (${lead.inquiryType})`;
        const html = `
      <h2>New Lead Received</h2>
      <p><strong>Name:</strong> ${lead.fullName}</p>
      <p><strong>Phone:</strong> ${lead.phoneNumber}</p>
      <p><strong>Email:</strong> ${lead.email || 'N/A'}</p>
      <p><strong>Source:</strong> ${lead.source}</p>
    `;
        return sendEmail(adminEmails, subject, html);
    },

    sendManualLeadNotification: async (lead, actorName, superAdminEmails) => {
        const subject = `📝 Lead Manually Added by ${actorName}`;
        const html = `
      <h2>New Lead Added Manually</h2>
      <p><strong>Added By:</strong> ${actorName}</p>
      <p><strong>Lead Name:</strong> ${lead.fullName}</p>
      <p><strong>Phone:</strong> ${lead.phoneNumber}</p>
    `;
        return sendEmail(superAdminEmails, subject, html);
    },

    sendLeadAssignedNotification: async (lead, assignedEmails, actorName) => {
        const subject = `🎯 New Lead Assigned To You`;
        const html = `
      <h2>You have a new lead!</h2>
      <p><strong>Assigned By:</strong> ${actorName}</p>
      <p><strong>Lead Name:</strong> ${lead.fullName}</p>
      <p><strong>Phone:</strong> ${lead.phoneNumber}</p>
      <p>Log in to the CRM to view details.</p>
    `;
        return sendEmail(assignedEmails, subject, html);
    },

    sendBulkLeadAssignedNotification: async (leadCount, assigneeName, assignedEmails, actorName) => {
        const subject = `📦 Bulk Leads Assigned To You`;
        const html = `
      <h2>You have new leads!</h2>
      <p><strong>${actorName}</strong> just assigned you <strong>${leadCount}</strong> leads.</p>
      <p>Log in to the CRM dashboard to review your new pipeline.</p>
    `;
        return sendEmail(assignedEmails, subject, html);
    }
};

module.exports = emailService;