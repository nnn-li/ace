export var asciiIdentifierStartTable = [];
for (var i = 0; i < 128; i++) {
    asciiIdentifierStartTable[i] =
        i === 36 ||
            i >= 65 && i <= 90 ||
            i === 95 ||
            i >= 97 && i <= 122;
}
export var asciiIdentifierPartTable = [];
for (var i = 0; i < 128; i++) {
    asciiIdentifierPartTable[i] =
        asciiIdentifierStartTable[i] ||
            i >= 48 && i <= 57;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNjaWktaWRlbnRpZmllci1kYXRhLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL21vZGUvamF2YXNjcmlwdC9hc2NpaS1pZGVudGlmaWVyLWRhdGEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsV0FBVyx5QkFBeUIsR0FBYyxFQUFFLENBQUM7QUFFckQsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO0lBQzNCLHlCQUF5QixDQUFDLENBQUMsQ0FBQztRQUN4QixDQUFDLEtBQUssRUFBRTtZQUNSLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUU7WUFDbEIsQ0FBQyxLQUFLLEVBQUU7WUFDUixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxHQUFHLENBQUM7QUFDNUIsQ0FBQztBQUVELFdBQVcsd0JBQXdCLEdBQWMsRUFBRSxDQUFDO0FBRXBELEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztJQUMzQix3QkFBd0IsQ0FBQyxDQUFDLENBQUM7UUFDdkIseUJBQXlCLENBQUMsQ0FBQyxDQUFDO1lBQzVCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUMzQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IHZhciBhc2NpaUlkZW50aWZpZXJTdGFydFRhYmxlOiBib29sZWFuW10gPSBbXTtcblxuZm9yICh2YXIgaSA9IDA7IGkgPCAxMjg7IGkrKykge1xuICAgIGFzY2lpSWRlbnRpZmllclN0YXJ0VGFibGVbaV0gPVxuICAgICAgICBpID09PSAzNiB8fCAgICAgICAgICAgLy8gJFxuICAgICAgICBpID49IDY1ICYmIGkgPD0gOTAgfHwgLy8gQS1aXG4gICAgICAgIGkgPT09IDk1IHx8ICAgICAgICAgICAvLyBfXG4gICAgICAgIGkgPj0gOTcgJiYgaSA8PSAxMjI7ICAvLyBhLXpcbn1cblxuZXhwb3J0IHZhciBhc2NpaUlkZW50aWZpZXJQYXJ0VGFibGU6IGJvb2xlYW5bXSA9IFtdO1xuXG5mb3IgKHZhciBpID0gMDsgaSA8IDEyODsgaSsrKSB7XG4gICAgYXNjaWlJZGVudGlmaWVyUGFydFRhYmxlW2ldID1cbiAgICAgICAgYXNjaWlJZGVudGlmaWVyU3RhcnRUYWJsZVtpXSB8fCAvLyAkLCBfLCBBLVosIGEtelxuICAgICAgICBpID49IDQ4ICYmIGkgPD0gNTc7ICAgICAgICAvLyAwLTlcbn1cbiJdfQ==