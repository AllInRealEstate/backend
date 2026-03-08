/**
 * Notification Content Constants
 * Used for Socket.io events and Database notification records
 */

module.exports = {
  TITLES: {
    LEAD_CREATED: 'New Lead Created',
    LEAD_ASSIGNED: 'New Lead Assigned',
    LEAD_REASSIGNED: 'Lead Reassigned',
    LEAD_UNASSIGNED: 'Lead Unassigned',
    STATUS_CHANGE: 'Lead Status Updated',
    PRIORITY_CHANGE: 'Lead Priority Updated',
    BULK_ASSIGNMENT: 'New Leads Assigned',
    BULK_DELETE: 'Leads Deleted',
    LEAD_DELETED: 'Lead Deleted',
    SYSTEM_ALERT: 'System Alert'
  },

  BODIES: {
    // Creation
    NEW_WEBSITE_LEAD: (source, name) => `New lead received from ${source}: ${name}`,
    MANUAL_LEAD_UNASSIGNED: (actor, name) => `${actor} created a new unassigned lead: ${name}`,
    MANUAL_LEAD_ASSIGNED: (actor, name) => `${actor} created lead ${name} and assigned it.`,
    
    // Assignment
    ASSIGNED_TO_YOU: (actor, leadName) => `${actor} assigned lead ${leadName} to you.`,
    ASSIGNED_TO_OTHER: (actor, leadName, workerName) => `${actor} assigned ${leadName} to ${workerName}`,
    REASSIGNED_TO_OTHER: (actor, leadName) => `${actor} reassigned ${leadName} to someone else.`,
    UNASSIGNED_FROM_YOU: (actor, leadName) => `${actor} unassigned you from ${leadName}.`,
    
    // Updates
    STATUS_CHANGED: (actor, leadName, status) => `${actor} changed status for ${leadName} to ${status}.`,
    PRIORITY_CHANGED: (actor, leadName, priority) => `${actor} changed priority of ${leadName} to ${priority}.`,
    
    // Bulk Operations
    BULK_ASSIGNED_TO_YOU: (count) => `You have been assigned ${count} new leads.`,
    BULK_UNASSIGNED_FROM_YOU: (count, actor) => `${count} leads were unassigned from you by ${actor}.`,
    BULK_ASSIGN_ADMIN_LOG: (actor, count) => `${actor} assigned ${count} leads.`, 
    BULK_DELETE_LOG: (count) => `${count} leads were deleted.`,
    
    // Access Control (Lead Room)
    ACCESS_REVOKED: 'This lead was reassigned'
  }
};