/**
 * Manual test script to verify the approval workflow
 * Run this with: tsx tests/manual/approval-workflow-test.ts
 */

import 'dotenv/config';
import { threadingService } from '../../src/services/threading';
import { processRefundTool } from '../../src/tools/orders';
import { customerSupportAgent } from '../../src/agents/customer-support';

async function testApprovalWorkflow() {
  console.log('🧪 Testing Approval Workflow');
  console.log('='.repeat(50));

  const testSubjectId = `approval-test-${Date.now()}`;
  
  try {
    // Test 1: Verify needsApproval logic
    console.log('\n📋 Test 1: needsApproval Logic');
    
    const needsApprovalLarge = await processRefundTool.needsApproval?.(
      {} as any,
      { amount: 150, orderId: 'TEST_001', reason: 'Test large refund' }
    );
    console.log(`   Large refund ($150) needs approval: ${needsApprovalLarge}`);
    
    const needsApprovalSmall = await processRefundTool.needsApproval?.(
      {} as any,
      { amount: 50, orderId: 'TEST_002', reason: 'Test small refund' }
    );
    console.log(`   Small refund ($50) needs approval: ${needsApprovalSmall}`);

    // Test 2: Tool execution without approval (small amount)
    console.log('\n📋 Test 2: Direct Tool Execution (No Approval Needed)');
    
    // The tool function is structured differently - let's test the internal execute function
    if (typeof processRefundTool === 'object' && processRefundTool.execute) {
      const smallRefundResult = await processRefundTool.execute({
        orderId: 'ORD_12345',
        amount: 50,
        reason: 'Customer satisfaction'
      });
      
      console.log(`   Result: ${JSON.stringify(smallRefundResult, null, 2)}`);
    } else {
      console.log('   Tool execution test skipped - direct execution not available');
    }

    // Test 3: Simulate threading workflow that would trigger approvals
    console.log('\n📋 Test 3: Threading Workflow Simulation');
    
    try {
      // This simulates what happens when a user asks for a refund over $100
      const userMessage = "I want to refund $150 for order ORD_12345 due to defective product";
      
      console.log(`   User message: "${userMessage}"`);
      console.log('   Processing with threading service...');
      
      // Note: This will likely not trigger actual approval workflow in test
      // because it needs a real OpenAI API call to execute the agent
      const result = await threadingService.handleTurn(
        customerSupportAgent,
        testSubjectId,
        userMessage,
        undefined,
        { showProgress: false, stream: false }
      );
      
      console.log(`   Result awaiting approvals: ${result.awaitingApprovals || false}`);
      console.log(`   Response: ${result.response?.substring(0, 200) || 'No response'}`);
      
    } catch (error) {
      console.log(`   Expected error (no API key or mock): ${(error as Error).message}`);
    }

    // Test 4: Direct approval handling (mock scenario)
    console.log('\n📋 Test 4: Approval Handling (Mock)');
    
    try {
      // This will fail because there's no pending state, but tests the logic
      const approvals = [
        { toolCall: { id: 'mock_call_123' }, approved: true }
      ];
      
      await threadingService.handleApprovals(testSubjectId, approvals);
      console.log('   ❌ Unexpected success - should have failed with no pending state');
      
    } catch (error) {
      console.log(`   ✅ Expected error: ${(error as Error).message}`);
    }

    console.log('\n✅ Approval workflow tests completed');
    console.log('\nTo test the full workflow:');
    console.log('1. Start the voice server: npm run voice:dev');
    console.log('2. Use the CLI: npm run start');
    console.log('3. Ask for a refund over $100');
    console.log('4. Use the displayed API endpoint to approve/reject');

  } catch (error) {
    console.error('\n❌ Test failed:', (error as Error).message);
    console.error(error);
  } finally {
    // Cleanup
    try {
      await threadingService.cleanupConversation(testSubjectId);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
  }
}

// Run the test
testApprovalWorkflow().catch(console.error);