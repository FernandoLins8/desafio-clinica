import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) { }

  async findAll() {
    return this.prisma.appointment.findMany()
  }

  async findAllFromUser(userId: string) {
    return this.prisma.appointment.findMany({
      where: {
        clientId: userId
      }
    })
  }

  async create(data: CreateAppointmentDto, clientId: string) {
    const appointment = await this.prisma.appointment.create({
      data: {
        clientId,
        professionalId: data.professionalId
      }
    })

    data.servicesIds.forEach(async (serviceId) => {
      await this.prisma.appointmentService.create({
        data: {
          service: {
            connect: { id: serviceId }
          },
          appointment: {
            connect: { id: appointment.id }
          }
        }
      });
    });

    return appointment
  }

  async addService(appointmentId: string, serviceId: string) {
    return await this.prisma.appointmentService.create({
      data: {
        appointmentId,
        serviceId
      }
    })
  }

  async startAppointment(appointmentId: string, attendeeId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId }
    })

    if (appointment.startTime != null) {
      throw new Error('Appointment was already started')
    }

    return this.prisma.appointment.update({
      data: {
        attendeeId,
        startTime: new Date()
      }, where: {
        id: appointmentId
      }
    })
  }

  async finishAppointment(appointmentId: string, attendeeId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId }
    })

    if (!appointment.startTime) {
      throw new Error('Appointment did not start')
    }

    if (appointment.endTime) {
      throw new Error('Appointment was already finished')
    }

    return await this.prisma.appointment.update({
      data: {
        attendeeId,
        endTime: new Date()
      }, where: {
        id: appointmentId
      }
    })
  }

  async getAppointmentSummary(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: {
        id: appointmentId
      },
      include: {
        appointmentService: {
          include: {
            service: {
              select: {
                name: true,
                duration: true,
                value: true
              }
            }
          }
        },
        professional: {
          select: {
            commission: true
          }
        }
      }
    })

    let expectedDurationInMinutes = 0
    let servicesCost = 0

    const parsedServices = appointment.appointmentService.map(appointment => {
      const { name, duration, value } = appointment.service

      expectedDurationInMinutes += duration
      servicesCost += value

      return {
        name: name,
        duration: duration,
        value: value,
      }
    })

    const professionalCommission = servicesCost * appointment.professional.commission
    const appointmentDurationInMinutes = Number((((
      appointment.endTime.getTime() - appointment.createdAt.getTime())
      / (60 * 10)) / 60).toFixed(2))

    return {
      servicesCost,
      professionalCommission,
      totalCost: servicesCost + professionalCommission,
      expectedDurationInMinutes,
      appointmentDurationInMinutes, // 60 seconds per minute, 1000 milliseconds per second
      services: parsedServices
    }
  }
}
