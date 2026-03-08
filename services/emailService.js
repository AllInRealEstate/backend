// services/emailService.js
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendLeadNotification = async (lead) => {
  try {
    await resend.emails.send({
      from: "All-In Real Estate <onboarding@resend.dev>",
      to: process.env.LEAD_NOTIFY_EMAIL,
      subject: "📩 New Lead Submission",
      html: `
        <h2>New Lead Received</h2>
        <p><strong>Name:</strong> ${lead.fullName}</p>
        <p><strong>Email:</strong> ${lead.email}</p>
        <p><strong>Phone:</strong> ${lead.phoneNumber}</p>
        <p><strong>Interest:</strong> ${lead.inquiryType}</p>
        <p><strong>Message:</strong> ${lead.message}</p>
        <p>Submitted At: ${new Date().toLocaleString()}</p>
      `
    });

    console.log("📧 Resend email sent");
  } catch (error) {
    console.error("❌ Resend email error:", error);
  }
};

// 2. NEW: Super Admin Manually Creates a Lead
const sendManualLeadNotification = async (lead, creatorName, superAdminEmails) => {
  if (!superAdminEmails || superAdminEmails.length === 0) return;
  try {
    await resend.emails.send({
      from: "All-In Real Estate <onboarding@resend.dev>",
      to: superAdminEmails, 
      subject: `🚀 Lead Manually Added by ${creatorName}`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <h2 style="color: #d4af37;">New Lead Manually Added</h2>
          <p><strong>${creatorName}</strong> has manually added a new lead to the CRM.</p>
          <hr style="border: 1px solid #f0f0f0;" />
          <p><strong>Client Name:</strong> ${lead.fullName || "Unknown"}</p>
          <p><strong>Phone:</strong> ${lead.phoneNumber || "—"}</p>
          <p><strong>Email:</strong> ${lead.email || "—"}</p>
          <p><strong>Interest:</strong> ${lead.inquiryType || "—"}</p>
          <p><strong>Priority:</strong> ${lead.priority || "Medium"}</p>
          <p><strong>Client Note:</strong> ${lead.message || "—"}</p>
          <br/>
          <p style="font-size: 0.8rem; color: #888;">Added At: ${new Date().toLocaleString()}</p>
        </div>
      `
    });
    console.log(`📧 Resend manual lead email sent to ${superAdminEmails.length} Super Admin(s)`);
  } catch (error) {
    console.error("❌ Resend manual lead email error:", error);
  }
};

// 3. NEW: Lead is Assigned to an Admin
const sendLeadAssignedNotification = async (lead, assigneeEmails, assignerName) => {
  if (!assigneeEmails || assigneeEmails.length === 0) return;
  try {
    await resend.emails.send({
      from: "All-In Real Estate <onboarding@resend.dev>",
      to: assigneeEmails,
      subject: "🎯 New Lead Assigned To You!",
      html: `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <h2 style="color: #2563eb;">You Have a New Lead!</h2>
          <p><strong>${assignerName}</strong> just assigned a new lead to you.</p>
          <hr style="border: 1px solid #f0f0f0;" />
          <p><strong>Client Name:</strong> ${lead.fullName || "Unknown"}</p>
          <p><strong>Phone:</strong> ${lead.phoneNumber || "—"}</p>
          <p><strong>Email:</strong> ${lead.email || "—"}</p>
          <p><strong>Interest:</strong> ${lead.inquiryType || "—"}</p>
          <p><strong>Client Note:</strong> ${lead.message || "—"}</p>
          <br/>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/leads" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">View in Dashboard</a>
        </div>
      `
    });
    console.log(`📧 Resend assignment email sent to ${assigneeEmails.length} Admin(s)`);
  } catch (error) {
    console.error("❌ Resend assignment email error:", error);
  }
};


// 4. NEW: Bulk Lead Assignment Summary
const sendBulkLeadAssignedNotification = async (count, assigneeEmails, assignerName) => {
  if (!assigneeEmails || assigneeEmails.length === 0) return;
  try {
    await resend.emails.send({
      from: "All-In Real Estate <onboarding@resend.dev>",
      to: assigneeEmails,
      subject: `🎯 ${count} New Leads Assigned To You!`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <h2 style="color: #2563eb;">You Have New Leads!</h2>
          <p><strong>${assignerName}</strong> just bulk assigned <strong>${count}</strong> new leads to you.</p>
          <hr style="border: 1px solid #f0f0f0;" />
          <p>Please log in to your dashboard to review and contact your new clients.</p>
          <br/>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/leads" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">View My Leads</a>
        </div>
      `
    });
    console.log(`📧 Resend bulk assignment email sent to ${assigneeEmails.length} Admin(s)`);
  } catch (error) {
    console.error("❌ Resend bulk assignment email error:", error);
  }
};

module.exports = { 
  sendLeadNotification, 
  sendManualLeadNotification, 
  sendLeadAssignedNotification,
  sendBulkLeadAssignedNotification
};



