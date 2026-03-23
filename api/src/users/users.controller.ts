import { Controller, Get, Post, Query, Body, Param } from '@nestjs/common';

@Controller('users')
export class UsersController {
    @Get()
    getUsers(@Query('sort') sort: 'asc' | 'desc' = 'asc') {
        return `Users List sorted by ${sort}`;
    }

    @Get('featured')
    getFeaturedUsers() {
        return 'Featured Users';
    }

    @Get(':id')
    getUser(@Param('id') id: string) {
        return `User ${id}`;
    }

    @Post()
    createUser(@Body() body: any) {
        return 'User Created';
    }
}
