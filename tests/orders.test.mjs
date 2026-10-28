import test from 'node:test';
import assert from 'node:assert/strict';
import {canCustomerCancelOrder,canTransitionOrder} from '../src/server/order-policy.ts';

test('customer and kitchen order progression follows the allowed state machine',()=>{
 assert.equal(canTransitionOrder('PLACED','ACCEPTED'),true);
 assert.equal(canTransitionOrder('PLACED','PREPARING'),true);
 assert.equal(canTransitionOrder('PREPARING','READY'),true);
 assert.equal(canTransitionOrder('READY','COLLECTED'),true);
});
test('completed or cancelled orders cannot be reopened',()=>{
 for(const terminal of ['SERVED','COLLECTED','DELIVERED','CANCELLED','REJECTED'])assert.equal(canTransitionOrder(terminal,'PREPARING'),false);
});
test('customers cannot cancel an order after preparation starts',()=>{
 assert.equal(canCustomerCancelOrder('PLACED'),true);
 assert.equal(canCustomerCancelOrder('ACCEPTED'),true);
 assert.equal(canCustomerCancelOrder('PREPARING'),false);
});
