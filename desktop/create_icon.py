from PIL import Image, ImageDraw

size = 512
image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((28, 28, 484, 484), radius=112, fill="#176C58")
draw.polygon([(104, 210), (256, 132), (408, 210), (256, 288)], fill="white")
draw.polygon([(158, 247), (256, 298), (354, 247), (354, 326), (256, 380), (158, 326)], fill="#E4F5EF")
draw.line([(404, 216), (404, 330)], fill="white", width=18)
draw.ellipse((390, 316, 418, 344), fill="white")
image.save("desktop/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
