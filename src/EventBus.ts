interface EventBus {
    on(eventName: string, callback: (event: any) => any, capturing?: boolean): void;
    off(eventName: string, callback: (event: any) => any): void;
}

export default EventBus;