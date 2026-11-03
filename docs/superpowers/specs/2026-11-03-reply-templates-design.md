# Mẫu trả lời trong Khay

Ngày: 2026-11-03. Trạng thái: **chờ người dùng duyệt thiết kế**.

## Mục đích

Giúp người dùng lưu và tái sử dụng những đoạn chữ thường gửi đi. Khay hiện giữ các mẩu nội dung để chuyển một lần; Mẫu trả lời là nội dung có tên để dùng lặp lại.

## Các cách đã cân nhắc

1. **Thêm mục Mẫu trong Khay — đã chọn.** Mẫu ở cạnh các nội dung đang chuyển, dễ tìm và sao chép mà không thêm cửa sổ quản lý mới.
2. **Trình quản lý riêng từ `⌘/Ctrl K`.** Có thể tìm mẫu từ mọi nơi, nhưng cần thêm một màn hình quản lý và thao tác điều hướng khác.

## Phạm vi bản đầu

- Khay có hai mục: **Nội dung** (hiện tại) và **Mẫu**.
- Mỗi mẫu có tên và nội dung chữ; người dùng có thể thêm, sửa, xóa, tìm theo tên/nội dung và bấm **Sao chép**.
- Khi sao chép, Gom chỉ ghi mẫu vào clipboard sau thao tác bấm rõ ràng và báo trạng thái thành công. Người dùng tự chọn cuộc trò chuyện, dán, kiểm tra và gửi.
- Mẫu được lưu trên máy qua lần mở lại, dùng kho mã hóa hiện có của Khay và tách giữa Không gian thường/Kín. Theo đề xuất thiết kế, mẫu dùng chung trong cùng không gian riêng tư giữa các tài khoản và bố cục làm việc.
- Giao diện theo kiểu, màu và trạng thái rỗng của Khay hiện tại; mở/đóng hoặc đổi mục không tải lại trang chat và không làm mất bản nháp.

## Ngoài phạm vi và ranh giới

- Không đọc nội dung chat, theo dõi clipboard, tự chèn vào ô soạn, tự gửi tin, đồng bộ qua mạng, mẫu có biến, nhóm/tag, hay tìm mẫu bằng command palette.
- Khi khóa hoặc đổi không gian, nội dung kín phải được gỡ khỏi giao diện và callback cũ không được trả mẫu của không gian trước.
- Tính năng không đạt nếu yêu cầu tích hợp DOM của nền tảng hoặc khiến nội dung được gửi mà người dùng chưa tự kiểm tra.

## Ràng buộc và phần để người triển khai chốt

- Tôn trọng luồng IPC và lưu trữ tin cậy của Khay; không lưu bản rõ vào log, cấu hình xuất, hay dữ liệu đồng bộ.
- Giới hạn độ dài tên/nội dung, schema lưu và cách thông báo lỗi có thể được chốt khi lập kế hoạch, miễn là nội dung được xác thực, giới hạn hợp lý và lỗi không làm mất dữ liệu Khay đã có.
- Chấp nhận khi CRUD và tìm kiếm hoạt động trong cả hai không gian, dữ liệu còn sau khi khởi động lại, khóa/đổi không gian không rò nội dung, thao tác Sao chép chỉ chạy khi được bấm, và Khay hiện tại vẫn giữ nguyên hành vi.
