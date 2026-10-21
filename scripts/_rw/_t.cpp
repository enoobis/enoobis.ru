#include <iostream>
#include <string>
int main() {
    std::string message1{"hello world", 4};
    std::string message2{"hello world", 6, 5};
    std::string hello{"hello world"};
    std::string message3{hello, 4};
    std::string message4{hello, 6, 5};
    std::cout << "1[" << message1 << "]\n";
    std::cout << "2[" << message2 << "]\n";
    std::cout << "3[" << message3 << "]\n";
    std::cout << "4[" << message4 << "]\n";
}
