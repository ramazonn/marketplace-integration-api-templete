export enum UzumPaymentPayType {
    ONE_STEP = 'ONE_STEP',
    TWO_STEP = 'TWO_STEP',
}

export enum UzumPaymentViewType {
    WEB_VIEW = 'WEB_VIEW',
    IFRAME = 'IFRAME',
    REDIRECT = 'REDIRECT',
}

export enum UzumPaymentReceiptType {
    PURCHASE = 'PURCHASE',
    PREPAID = 'PREPAID'
}

export enum UzumPaymentOperationState {
    SUCCESS = 'SUCCESS',
    FAIL = 'FAIL',
}

export enum UzumPaymentOperationType {
    AUTHORIZE = 'AUTHORIZE',
    COMPLETE = 'COMPLETE',
    REFUND = 'REFUND',
    REVERSE = 'REVERSE',
    TOP_UP_COMPLETED = 'TOP_UP_COMPLETED',
}