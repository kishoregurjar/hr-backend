const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const mailbox = await prisma.userMailbox.findFirst();
    const ownerEmail = mailbox ? mailbox.email : null;

    let sentFromMeCount = 0;
    console.log('--- RECENT CANDIDATES EVIDENCE ---');
    console.log('Owner Email: ' + ownerEmail);

    const recentEvents = await prisma.inboundEmailEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100
    });
    
    for (const event of recentEvents) {
        if (!event.senderEmail && !event.sender) continue;
        const sender = event.senderEmail || event.sender || '';
        
        if (ownerEmail && sender.toLowerCase().includes(ownerEmail.toLowerCase())) {
            sentFromMeCount++;
            console.log('\n*** MATCH: InboundEmailEvent from sent email: ***');
            console.log('  Event ID: ' + event.id);
            console.log('  Provider Message ID: ' + event.providerMessageId);
            console.log('  Sender: ' + sender);
            console.log('  Event CreatedAt: ' + event.createdAt);
            console.log('  ResumeProcessing ID: ' + event.resumeProcessingId);
            
            if (event.resumeProcessingId) {
                const rp = await prisma.resumeProcessing.findUnique({
                    where: { id: event.resumeProcessingId },
                    include: { candidate: true }
                });
                if (rp && rp.candidate) {
                     console.log('  Candidate ID: ' + rp.candidate.id);
                     console.log('  Candidate Email: ' + rp.candidate.email);
                } else {
                     // Check JobApplications
                     const apps = await prisma.jobApplication.findMany({
                         where: { resumeProcessingId: event.resumeProcessingId }
                     });
                     for (const app of apps) {
                         console.log('  Candidate ID (via app): ' + app.candidateId);
                         console.log('  Candidate Email (via app): ' + app.candidateEmail);
                     }
                     // Check CandidateProfiles directly by email?
                }
            }
        }
    }
    
    console.log('\nTotal events from sent emails: ' + sentFromMeCount);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
run();
