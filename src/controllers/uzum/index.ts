import UzumPaymentCallbackController from './UzumPaymentConfirmCallbackControllert.controller';
import UzumCheckController from './UzumCheckPayment.controller';
import UzumConfirmController from './UzumConfirmPayment.controller';
import UzumCreateController from './UzumCreatePayment.controller';
import UzumEventCallbackController from './UzumEventCallbackUrlPayment.controller';
import UzumPaymentRegisterController from './UzumPaymentRegister.controller';
import UzumReceiptCallbackController from './UzumReceiptCallbackUrlPayment.controller';
import UzumReverseController from './UzumReversePayment.controller';
import UzumStatusController from './UzumStatusPayment.controller';
import UzumPaymentConfirmCallbackController from './UzumPaymentConfirmCallbackControllert.controller';

export const UzumControllers = {
  UzumCheckController: UzumCheckController.controller,
  UzumCreatePaymentController: UzumCreateController.controller,
  UzumConfirmPaymentController: UzumConfirmController.controller,
  UzumReversePaymentController: UzumReverseController.controller,
  UzumStatusPaymentController: UzumStatusController.controller,

  UzumPaymentRegisterController: UzumPaymentRegisterController.controller,
  UzumEventCallbackController: UzumEventCallbackController.controller,
  UzumReceiptCallbackController: UzumReceiptCallbackController.controller,
  UzumPaymentConfirmCallbackController: UzumPaymentConfirmCallbackController.controller,
};
